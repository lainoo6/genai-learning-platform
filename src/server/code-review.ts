"use server";
import { z } from "zod";
import { getI18n } from "@/i18n/server";
import { persistActivity } from "@/lib/activity-store";
import { gradeActivity } from "@/lib/blocks/activity-result";
import { activityAccess } from "@/lib/activity-access";
import { codingBlockSchema } from "@/lib/blocks/schema";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import {
  codeReviewPrompt,
  codeReviewSchema,
} from "@/lib/llm/prompts/code-review";
import { generateJson, isMockMode } from "@/lib/llm/provider";
import { registerLlmMocks } from "@/lib/llm/mocks";
const inputSchema = z.object({
  attemptId: z.string().uuid(),
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
  code: z.string().min(1).max(50000),
  evidence: z.object({
    results: z
      .array(
        z.object({
          name: z.string().max(500),
          passed: z.boolean(),
          error: z.string().max(10000).nullable(),
        }),
      )
      .max(200)
      .nullable(),
    failure: z.string().max(10000).nullable(),
  }),
  previewBlock: codingBlockSchema.optional(),
});
export async function requestCodeReview(input: z.input<typeof inputSchema>) {
  try {
    const parsed = inputSchema.parse(input);
    const access = await activityAccess(
      parsed.lessonId,
      parsed.blockId,
      parsed.previewBlock,
    );
    if (access.block.type !== "coding")
      throw new Error("Coding activity required.");
    const { locale } = await getI18n();
    registerLlmMocks();
    const report = await generateJson(
      codeReviewSchema,
      codeReviewPrompt(
        access.block,
        parsed.code,
        parsed.evidence,
        contentLanguageFromLocale(locale),
      ),
      {
        usage: "code-review",
        userId: access.userId,
        courseId: access.courseId,
        temperature: 0.2,
      },
    );
    if (!access.preview) {
      const answer = {
        code: parsed.code,
        results: parsed.evidence.results ?? [],
        failure: parsed.evidence.failure,
        kind: "review",
      };
      const grade = gradeActivity(access.block, answer);
      await persistActivity({
        ...access,
        courseId: access.courseId!,
        lessonId: parsed.lessonId,
        attemptId: parsed.attemptId,
        answer,
        grade: {
          ...grade,
          score: null,
          completed: false,
          passed: null,
          verification: isMockMode() ? "mock" : "ai",
          feedback: { ...grade.feedback, review: report, mock: isMockMode() },
        },
      });
    }
    return { ok: true as const, report, mock: isMockMode() };
  } catch (cause) {
    return {
      ok: false as const,
      error:
        cause instanceof Error
          ? cause.message
          : "Code review unavailable. Retry.",
    };
  }
}
