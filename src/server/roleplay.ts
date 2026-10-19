"use server";

import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { blockListSchema } from "@/lib/blocks/schema";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import { registerLlmMocks } from "@/lib/llm/mocks";
import { generateJson } from "@/lib/llm/provider";
import {
  roleplayFeedbackPrompt,
  roleplayFeedbackSchema,
  roleplayTurnSchema,
  ROLEPLAY_MAX_TRANSCRIPT,
  type RoleplayFeedback,
} from "@/lib/llm/prompts/roleplay";
import { prisma } from "@/lib/prisma";

/**
 * End-of-activity grading for the roleplay block (P4.5).
 *
 * The browser owns the transcript (the chat is not persisted), so it sends the
 * turns back for grading. The block — and therefore the rubric the model is
 * asked to score — is always read from the stored lesson, never from the
 * request, so a learner cannot rewrite the criteria they are graded against.
 */

export type RoleplayFeedbackResult =
  | { ok: true; report: RoleplayFeedback }
  | { ok: false; error: string };

const inputSchema = z.object({
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  transcript: z
    .array(roleplayTurnSchema)
    .min(1)
    .max(ROLEPLAY_MAX_TRANSCRIPT),
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

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.roleplay.signIn") };
  }

  const { lessonId, blockId, transcript } = parsedInput.data;

  if (!transcript.some((turn) => turn.role === "user")) {
    return { ok: false, error: t("server.roleplay.empty") };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      blocks: true,
      module: { select: { courseId: true } },
    },
  });

  if (lesson === null) {
    return { ok: false, error: t("server.roleplay.lessonNotFound") };
  }

  const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
  const block = parsedBlocks.success
    ? parsedBlocks.data.find(
        (candidate) => candidate.id === blockId && candidate.type === "roleplay",
      )
    : undefined;

  if (block === undefined || block.type !== "roleplay") {
    return { ok: false, error: t("server.roleplay.blockNotFound") };
  }

  const courseId = lesson.module.courseId;
  registerLlmMocks();

  try {
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

    const total = report.criteria.reduce(
      (sum, criterion) => sum + criterion.score,
      0,
    );
    const averageScore =
      report.criteria.length === 0
        ? 0
        : Math.round((total / report.criteria.length) * 10) / 10;

    await trackEvent("ROLEPLAY_END", {
      userId,
      courseId,
      payload: {
        lessonId,
        blockId,
        turns: transcript.length,
        averageScore,
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
