"use server";

import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import { activityAccess } from "@/lib/activity-access";
import { persistActivity } from "@/lib/activity-store";
import { normalizedScore } from "@/lib/blocks/activity-result";
import { roleplayBlockSchema } from "@/lib/blocks/schema";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { generateJson, isMockMode } from "@/lib/llm/provider";
import {
  roleplayFeedbackPrompt,
  roleplayFeedbackSchema,
  roleplayTurnSchema,
  ROLEPLAY_MAX_TRANSCRIPT,
  type RoleplayFeedback,
} from "@/lib/llm/prompts/roleplay";

/**
 * End-of-activity grading for the roleplay block (P4.5).
 *
 * The browser owns the transcript (completed chats are persisted), so it sends the
 * turns back for grading. The block — and therefore the rubric the model is
 * asked to score — is always read from the stored lesson, never from the
 * request, so a learner cannot rewrite the criteria they are graded against.
 */

export type RoleplayFeedbackResult =
  { ok: true; report: RoleplayFeedback } | { ok: false; error: string };

const inputSchema = z.object({
  attemptId: z.string().uuid(),
  previewBlock: roleplayBlockSchema.optional(),
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  transcript: z.array(roleplayTurnSchema).min(1).max(ROLEPLAY_MAX_TRANSCRIPT),
});

type RoleplayFeedbackInput = z.input<typeof inputSchema>;

/** Grades one finished conversation and records the ROLEPLAY_END event. */
export async function requestRoleplayFeedback(
  input: RoleplayFeedbackInput,
): Promise<RoleplayFeedbackResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.roleplay.submitFailed") };
  }

  const { lessonId, blockId, transcript, attemptId, previewBlock } =
    parsedInput.data;
  if (!transcript.some((turn) => turn.role === "user"))
    return { ok: false, error: t("server.roleplay.empty") };
  let access;
  try {
    access = await activityAccess(lessonId, blockId, previewBlock);
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : t("server.roleplay.failed"),
    };
  }
  const { block, userId, courseId } = access;
  if (block.type !== "roleplay")
    return { ok: false, error: t("server.roleplay.blockNotFound") };
  registerLlmMocks();

  try {
    if (!access.preview) {
      const existing = await prisma.activityAttempt.findUnique({
        where: {
          userId_lessonId_blockId_attemptId: {
            userId,
            lessonId,
            blockId,
            attemptId,
          },
        },
      });
      if (existing) {
        const saved = existing.result as { feedback?: { report?: unknown } };
        return {
          ok: true,
          report: roleplayFeedbackSchema.parse(saved.feedback?.report),
        };
      }
    }
    const report = await generateJson(
      roleplayFeedbackSchema,
      roleplayFeedbackPrompt(block, transcript, language),
      {
        usage: "roleplay-feedback",
        userId,
        courseId,
        input: { lessonId, blockId, turns: transcript.length },
        temperature: 0.3,
      },
    );

    if (
      report.criteria.length !== block.payload.rubric.length ||
      report.criteria.some((c, i) => c.criterion !== block.payload.rubric[i])
    )
      throw new Error("Feedback rubric mismatch. Please retry.");
    const total = report.criteria.reduce(
      (sum, criterion) => sum + criterion.score,
      0,
    );
    if (!access.preview)
      await persistActivity({
        ...access,
        courseId: courseId!,
        lessonId,
        attemptId,
        answer: { transcript },
        grade: {
          score: isMockMode()
            ? null
            : normalizedScore(total, 0, report.criteria.length * 5),
          completed: true,
          passed: null,
          verification: isMockMode() ? "mock" : "ai",
          feedback: { report, mock: isMockMode() },
        },
      });

    return { ok: true, report };
  } catch (error: unknown) {
    console.error("[roleplay] feedback failed", error);
    return {
      ok: false,
      error: t("server.roleplay.failed"),
    };
  }
}
