"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { blockSchema } from "@/lib/blocks/schema";
import { contentLanguageFromLocale } from "@/lib/llm/language";
import { registerLlmMocks } from "@/lib/llm/mocks";
import {
  generateJson,
  isMockMode,
  LlmError,
  LlmValidationError,
} from "@/lib/llm/provider";
import {
  audienceSchema,
  authoringDifficultySchema,
  courseOutlinePrompt,
  courseOutlineSchema,
  suggestedBlockTypeSchema,
  type CourseOutline,
} from "@/lib/llm/prompts/outline";
import {
  generatedLessonSchema,
  lessonPrompt,
  type GeneratedLesson,
} from "@/lib/llm/prompts/lesson";
import {
  gameActivityPrompt,
  generatedGameActivitySchema,
  type GeneratedGameActivity,
} from "@/lib/llm/prompts/game-activity";
import type { Translator } from "@/i18n/translate";
import { prisma } from "@/lib/prisma";
import { validateGameActivity } from "@/lib/game-activity";

/**
 * Server actions behind the instructor course wizard (P4.6).
 *
 * Three actions mirror the wizard's steps: plan the outline, write one lesson,
 * save the whole thing as a draft. Each is independent so a failed lesson never
 * discards work the instructor has already reviewed, and every LLM call goes
 * through `generateJson`, which writes the GenerationJob audit row.
 *
 * Authorisation is re-checked here (not just in the middleware) because a
 * server action is a public endpoint: only instructors and admins may generate
 * or save, and a saved course is always owned by the caller.
 */

export type OutlineResult =
  | { ok: true; outline: CourseOutline }
  | { ok: false; error: string };

export type LessonResult =
  | { ok: true; lesson: GeneratedLesson }
  | { ok: false; error: string };

export type GameActivityResult =
  | { ok: true; activity: GeneratedGameActivity }
  | { ok: false; error: string };

export type SaveDraftResult =
  | { ok: true; courseId: string; title: string }
  | { ok: false; error: string };

const outlineInputSchema = z.object({
  topic: z.string().trim().min(3).max(120),
  audience: audienceSchema,
  difficulty: authoringDifficultySchema,
  lessonCount: z.number().int().min(3).max(8),
  notes: z.string().trim().max(800).default(""),
});

export type OutlineInput = z.input<typeof outlineInputSchema>;

const lessonInputSchema = z.object({
  courseTitle: z.string().trim().min(3).max(90),
  courseDescription: z.string().trim().min(20).max(600),
  topic: z.string().trim().min(3).max(120),
  audience: audienceSchema,
  difficulty: authoringDifficultySchema,
  notes: z.string().trim().max(800).default(""),
  moduleTitle: z.string().trim().min(1).max(80),
  lessonTitle: z.string().trim().min(2).max(120),
  /** Empty when the instructor added a lesson by hand and has not written a brief. */
  lessonSummary: z.string().trim().max(400).default(""),
  suggestedBlocks: z.array(suggestedBlockTypeSchema).min(1).max(6),
  lessonNumber: z.number().int().min(1).max(12),
  lessonCount: z.number().int().min(1).max(12),
});

const gameActivityInputSchema = z.object({
  lessonTitle: z.string().trim().min(2).max(120),
  objectives: z.string().trim().min(1).max(1200),
  sourceContent: z.string().trim().min(20).max(20_000),
});

export type GameActivityInput = z.input<typeof gameActivityInputSchema>;

export type LessonInput = z.input<typeof lessonInputSchema>;

const draftLessonSchema = z.object({
  title: z.string().trim().min(2).max(120),
  estimatedMinutes: z.number().int().min(1).max(60),
  blocks: z.array(blockSchema).min(1).max(8),
});

const draftInputSchema = z.object({
  title: z.string().trim().min(3).max(90),
  description: z.string().trim().min(20).max(600),
  topic: z.string().trim().min(3).max(120),
  audience: audienceSchema,
  difficulty: authoringDifficultySchema,
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        lessons: z.array(draftLessonSchema).min(1).max(8),
      }),
    )
    .min(1)
    .max(4),
});

export type DraftCourseInput = z.input<typeof draftInputSchema>;

type InstructorCheck =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** Resolves the caller and confirms they are allowed to author courses. */
async function requireInstructor(t: Translator): Promise<InstructorCheck> {
  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    return { ok: false, error: t("server.teach.signIn") };
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    return { ok: false, error: t("server.teach.instructorOnly") };
  }

  return { ok: true, userId: user.id };
}

/**
 * Turns a failure into one sentence an instructor can act on.
 *
 * Validation failures are the model's fault and are worth retrying; a missing
 * key or a network error is worth surfacing verbatim (truncated) so the person
 * running the demo can see what is wrong.
 */
function describeFailure(
  step: "outline" | "lesson",
  error: unknown,
  t: Translator,
): string {
  if (error instanceof LlmValidationError) {
    return step === "outline"
      ? t("server.teach.outlineFormat")
      : t("server.teach.lessonFormat");
  }

  if (error instanceof LlmError) {
    return step === "outline"
      ? t("server.teach.outlineFailed", { detail: error.message })
      : t("server.teach.lessonFailed", { detail: error.message });
  }

  const detail = error instanceof Error ? error.message : "unknown error";
  console.error(`[teach] ${step} failed`, error);

  return step === "outline"
    ? t("server.teach.outlineError", { detail: detail.slice(0, 200) })
    : t("server.teach.lessonError", { detail: detail.slice(0, 200) });
}

/** URL-safe stub of the title plus a random suffix, so slugs never collide. */
function courseSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);

  return `${base.length > 0 ? base : "course"}-${randomUUID().slice(0, 8)}`;
}

/**
 * Audit row for a mock generation.
 *
 * `generateJson` records a GenerationJob for real model calls only (P4.1), so
 * without a key the wizard would leave no trail at all. The task requires every
 * step of the wizard to be auditable, so mock runs are recorded here with the
 * same `type` convention the service layer uses, plus `mock: true` in the input
 * so an auditor can tell canned content from a model reply. Real calls are not
 * recorded twice: the helper only writes when `isMockMode()` is on.
 */
async function recordMockJob(entry: {
  usage: "course-outline" | "course-lesson";
  userId: string;
  prompt: string;
  input: unknown;
  output: unknown;
}): Promise<void> {
  if (!isMockMode()) {
    return;
  }

  try {
    await prisma.generationJob.create({
      data: {
        type: entry.usage.toUpperCase(),
        input: {
          prompt: entry.prompt,
          request: entry.input ?? null,
          mock: true,
        } as Prisma.InputJsonValue,
        output: entry.output as Prisma.InputJsonValue,
        status: "SUCCESS",
        createdById: entry.userId,
      },
    });
  } catch (error: unknown) {
    console.error("[teach] failed to record the mock GenerationJob", error);
  }
}

/** Plans a course: title, description and modules of summarised lessons. */
export async function generateCourseOutline(
  input: OutlineInput,
): Promise<OutlineResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const parsedInput = outlineInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: t("server.teach.outlineInvalid"),
    };
  }

  const instructor = await requireInstructor(t);
  if (!instructor.ok) {
    return { ok: false, error: instructor.error };
  }

  registerLlmMocks();

  const prompt = courseOutlinePrompt({ ...parsedInput.data, language });

  try {
    const outline = await generateJson(courseOutlineSchema, prompt, {
      usage: "course-outline",
      userId: instructor.userId,
      input: parsedInput.data,
      temperature: 0.7,
    });

    await recordMockJob({
      usage: "course-outline",
      userId: instructor.userId,
      prompt,
      input: parsedInput.data,
      output: outline,
    });

    return { ok: true, outline };
  } catch (error: unknown) {
    return { ok: false, error: describeFailure("outline", error, t) };
  }
}

/** Writes the blocks of a single lesson from its outline summary. */
export async function generateLessonBlocks(
  input: LessonInput,
): Promise<LessonResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const parsedInput = lessonInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: t("server.teach.lessonInvalid"),
    };
  }

  const instructor = await requireInstructor(t);
  if (!instructor.ok) {
    return { ok: false, error: instructor.error };
  }

  const request = parsedInput.data;

  registerLlmMocks();

  const prompt = lessonPrompt({ ...request, language });
  const jobInput = {
    courseTitle: request.courseTitle,
    lessonTitle: request.lessonTitle,
    lessonNumber: request.lessonNumber,
  };

  try {
    const lesson = await generateJson(generatedLessonSchema, prompt, {
      usage: "course-lesson",
      userId: instructor.userId,
      input: jobInput,
      temperature: 0.5,
    });
    const activityPrompt = gameActivityPrompt({
      lessonTitle: request.lessonTitle,
      objectives: request.lessonSummary,
      sourceContent: JSON.stringify(
        lesson.blocks.filter((block) => block.type !== "game"),
      ).slice(0, 20_000),
      language,
    });
    const activity = await generateJson(
      generatedGameActivitySchema,
      activityPrompt,
      {
        usage: "course-game-activity",
        userId: instructor.userId,
        input: jobInput,
        temperature: 0.4,
      },
    );
    const activityValidation = validateGameActivity(activity, language);
    if (!activityValidation.ok) {
      return {
        ok: false,
        error: `Generated activity needs review: ${activityValidation.errors.join(" ")}`,
      };
    }

    await recordMockJob({
      usage: "course-lesson",
      userId: instructor.userId,
      prompt,
      input: jobInput,
      output: lesson,
    });

    return {
      ok: true,
      lesson: {
        ...lesson,
        blocks: [
          ...lesson.blocks.filter((block) => block.type !== "game"),
          ...activity,
        ],
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: describeFailure("lesson", error, t) };
  }
}

/** Generates the five-Challenge practice activity for an authored lesson. */
export async function generateGameActivity(
  input: GameActivityInput,
): Promise<GameActivityResult> {
  const { locale, t } = await getI18n();
  const parsedInput = gameActivityInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: t("server.teach.lessonInvalid") };
  }

  const instructor = await requireInstructor(t);
  if (!instructor.ok) return { ok: false, error: instructor.error };

  registerLlmMocks();
  const language = contentLanguageFromLocale(locale);
  const prompt = gameActivityPrompt({ ...parsedInput.data, language });

  try {
    const activity = await generateJson(generatedGameActivitySchema, prompt, {
      usage: "course-game-activity",
      userId: instructor.userId,
      input: parsedInput.data,
      temperature: 0.4,
    });
    const validation = validateGameActivity(activity, language);
    if (!validation.ok) {
      return {
        ok: false,
        error: `Generated activity needs review: ${validation.errors.join(" ")}`,
      };
    }
    return { ok: true, activity };
  } catch (error: unknown) {
    return { ok: false, error: describeFailure("lesson", error, t) };
  }
}

/**
 * Persists the reviewed course as a draft owned by the caller.
 *
 * The payload is re-validated here: the wizard's state lives in the browser, so
 * nothing about it can be trusted. Any number of lessons is accepted (the
 * wizard may add lessons by hand), but every block has to pass `blockSchema`.
 */
export async function saveCourseDraft(
  input: DraftCourseInput,
): Promise<SaveDraftResult> {
  const { locale, t } = await getI18n();
  const language = contentLanguageFromLocale(locale);
  const parsedInput = draftInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: t("server.teach.draftInvalid"),
    };
  }

  const instructor = await requireInstructor(t);
  if (!instructor.ok) {
    return { ok: false, error: instructor.error };
  }

  const draft = parsedInput.data;

  try {
    const course = await prisma.course.create({
      data: {
        slug: courseSlug(draft.title),
        title: draft.title,
        description: draft.description,
        topic: draft.topic,
        audience: draft.audience,
        difficulty: draft.difficulty,
        coverEmoji: "✨",
        language,
        status: "DRAFT",
        source: "AI_GENERATED",
        createdById: instructor.userId,
        modules: {
          create: draft.modules.map((courseModule, moduleIndex) => ({
            title: courseModule.title,
            order: moduleIndex,
            lessons: {
              create: courseModule.lessons.map((lesson, lessonIndex) => ({
                title: lesson.title,
                order: lessonIndex,
                estimatedMinutes: lesson.estimatedMinutes,
                blocks: lesson.blocks as unknown as Prisma.InputJsonValue,
              })),
            },
          })),
        },
      },
      select: { id: true, title: true },
    });

    return { ok: true, courseId: course.id, title: course.title };
  } catch (error: unknown) {
    console.error("[teach] failed to save the draft", error);
    return {
      ok: false,
      error: t("server.teach.saveFailed"),
    };
  }
}
