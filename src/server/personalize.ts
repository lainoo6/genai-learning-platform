"use server";

import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import {
  blockListSchema,
  type Block,
  type QuizQuestion,
} from "@/lib/blocks/schema";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import { registerLlmMocks } from "@/lib/llm/mocks";
import {
  explainResultSchema,
  explainSystemPrompt,
  explainUserPrompt,
} from "@/lib/llm/prompts/explain";
import { generateJson } from "@/lib/llm/provider";
import { prisma } from "@/lib/prisma";
import { loadLearnerProfile } from "@/lib/profile";

/**
 * "Explain for me" (P4.4).
 *
 * One server action rewrites a block for the signed-in learner; two more save
 * and clear the per-user override that makes the rewrite stick. Every action
 * validates its input, resolves the lesson itself (so a caller cannot point at
 * someone else's course) and returns a result object instead of throwing.
 */

const explainInputSchema = z.object({
  lessonId: z.string().min(1),
  blockId: z.string().min(1),
});

const overrideInputSchema = explainInputSchema.extend({
  markdown: z.string().trim().min(1).max(20000),
});

const GENERIC_FAILURE_KEY = "server.explain.failed";

/** How many recent attempts are scanned for the learner's wrong questions. */
const RECENT_ATTEMPT_SCAN = 10;

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ExplainBlockResult =
  | { ok: true; title: string; markdown: string; canReplace: boolean }
  | { ok: false; error: string };

/** Payload stored on the QUIZ_ATTEMPT event by the quiz block. */
const quizAttemptSchema = z.object({
  blockId: z.string().min(1),
  wrongQuestionIds: z.array(z.string().min(1)).default([]),
});

/**
 * Question ids the learner got wrong on their last attempt at this block.
 *
 * The quiz block records them on a `QUIZ_ATTEMPT` engagement event; the newest
 * matching event wins. The payload is re-validated because it is JSON written
 * by a client-facing action.
 */
async function latestWrongQuestionIds(
  userId: string,
  blockId: string,
): Promise<string[]> {
  const recent = await prisma.engagementEvent.findMany({
    where: { userId, type: "QUIZ_ATTEMPT" },
    orderBy: { createdAt: "desc" },
    take: RECENT_ATTEMPT_SCAN,
    select: { payload: true },
  });

  for (const row of recent) {
    const parsed = quizAttemptSchema.safeParse(row.payload);
    if (parsed.success && parsed.data.blockId === blockId) {
      return parsed.data.wrongQuestionIds;
    }
  }

  return [];
}

/** Questions of a quiz block that match the given ids, in block order. */
function questionsByIds(
  block: Block,
  ids: string[],
): QuizQuestion[] {
  if (block.type !== "quiz" || ids.length === 0) {
    return [];
  }

  return block.payload.questions.filter((question) => ids.includes(question.id));
}

/**
 * Rewrites one block for the signed-in learner.
 *
 * The learner profile decides the voice (see `STYLE_RULES`), and for a quiz the
 * questions they got wrong are quoted so the explanation is about their own
 * attempt rather than about the block in general.
 */
export async function explainBlock(
  lessonId: string,
  blockId: string,
): Promise<ExplainBlockResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const parsedInput = explainInputSchema.safeParse({ lessonId, blockId });
  if (!parsedInput.success) {
    return { ok: false, error: t("server.explain.notExplainable") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.explain.signIn") };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      blocks: true,
      module: {
        select: { courseId: true, course: { select: { title: true } } },
      },
    },
  });

  if (lesson === null) {
    return { ok: false, error: t("server.explain.lessonNotFound") };
  }

  const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
  if (!parsedBlocks.success) {
    return { ok: false, error: t("server.explain.invalidBlocks") };
  }

  const block = parsedBlocks.data.find((entry) => entry.id === blockId);
  if (block === undefined) {
    return { ok: false, error: t("server.explain.unknownBlock") };
  }

  const profile = await loadLearnerProfile(userId);
  const wrongQuestionIds =
    block.type === "quiz" ? await latestWrongQuestionIds(userId, blockId) : [];

  registerLlmMocks();

  const prompt = explainUserPrompt({
    language,
    profile,
    courseTitle: lesson.module.course.title,
    lessonTitle: lesson.title,
    block,
    wrongQuestions: questionsByIds(block, wrongQuestionIds),
  });

  try {
    const result = await generateJson(explainResultSchema, prompt, {
      usage: "explain-block",
      system: explainSystemPrompt(profile, language),
      temperature: 0.5,
      userId,
      courseId: lesson.module.courseId,
      input: {
        lessonId,
        blockId,
        blockType: block.type,
        background: profile?.background ?? null,
        wrongQuestionIds,
      },
    });

    return {
      ok: true,
      title: result.title,
      markdown: result.markdown,
      canReplace: block.type === "reading",
    };
  } catch (error: unknown) {
    console.error("[personalize] explainBlock failed", error);
    return { ok: false, error: t(GENERIC_FAILURE_KEY) };
  }
}

/**
 * Stores a personalised body for a reading block.
 *
 * Only reading blocks and only their markdown are stored, so a quiz can never
 * be rewritten into a different answer key.
 */
export async function saveBlockOverride(
  lessonId: string,
  blockId: string,
  markdown: string,
): Promise<ActionResult> {
  const { t } = await getI18n();
  const parsedInput = overrideInputSchema.safeParse({ lessonId, blockId, markdown });
  if (!parsedInput.success) {
    return { ok: false, error: t("server.explain.cannotSave") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.explain.signIn") };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { blocks: true },
  });

  if (lesson === null) {
    return { ok: false, error: t("server.explain.lessonNotFound") };
  }

  const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
  const block = parsedBlocks.success
    ? parsedBlocks.data.find((entry) => entry.id === blockId)
    : undefined;

  if (block === undefined || block.type !== "reading") {
    return { ok: false, error: t("server.explain.onlyReading") };
  }

  await prisma.userBlockOverride.upsert({
    where: { userId_lessonId_blockId: { userId, lessonId, blockId } },
    create: {
      userId,
      lessonId,
      blockId,
      markdown: parsedInput.data.markdown,
    },
    update: { markdown: parsedInput.data.markdown },
  });

  return { ok: true };
}

/** Drops a personalised body, restoring the authored content. */
export async function clearBlockOverride(
  lessonId: string,
  blockId: string,
): Promise<ActionResult> {
  const { t } = await getI18n();
  const parsedInput = explainInputSchema.safeParse({ lessonId, blockId });
  if (!parsedInput.success) {
    return { ok: false, error: t("server.explain.cannotRestore") };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    return { ok: false, error: t("server.explain.signIn") };
  }

  await prisma.userBlockOverride.deleteMany({
    where: { userId, lessonId, blockId },
  });

  return { ok: true };
}
