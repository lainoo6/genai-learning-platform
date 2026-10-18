"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { blockSchema } from "@/lib/blocks/schema";
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
import { prisma } from "@/lib/prisma";

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
async function requireInstructor(): Promise<InstructorCheck> {
  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    return { ok: false, error: "Sign in to generate a course." };
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    return { ok: false, error: "Only instructors can generate courses." };
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
function describeFailure(step: string, error: unknown): string {
  if (error instanceof LlmValidationError) {
    return `The ${step} came back in the wrong format. Try again, or add a note saying what to change.`;
  }

  if (error instanceof LlmError) {
    return `The ${step} failed: ${error.message}`;
  }

  const detail = error instanceof Error ? error.message : "unknown error";
  console.error(`[teach] ${step} failed`, error);

  return `The ${step} could not be generated (${detail.slice(0, 200)}). Check the API key, or set LLM_MOCK=true for canned content.`;
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
  const parsedInput = outlineInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error:
        "Fill in a topic of at least three characters, choose an audience and a difficulty, and pick 3 to 8 lessons.",
    };
  }

  const instructor = await requireInstructor();
  if (!instructor.ok) {
    return { ok: false, error: instructor.error };
  }

  registerLlmMocks();

  const prompt = courseOutlinePrompt(parsedInput.data);

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
    return { ok: false, error: describeFailure("outline", error) };
  }
}

/** Writes the blocks of a single lesson from its outline summary. */
export async function generateLessonBlocks(
  input: LessonInput,
): Promise<LessonResult> {
  const parsedInput = lessonInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: "This lesson is missing a title or a valid plan. Go back to the outline and fix it.",
    };
  }

  const instructor = await requireInstructor();
  if (!instructor.ok) {
    return { ok: false, error: instructor.error };
  }

  const request = parsedInput.data;

  registerLlmMocks();

  const prompt = lessonPrompt(request);
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

    await recordMockJob({
      usage: "course-lesson",
      userId: instructor.userId,
      prompt,
      input: jobInput,
      output: lesson,
    });

    return { ok: true, lesson };
  } catch (error: unknown) {
    return { ok: false, error: describeFailure("lesson", error) };
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
  const parsedInput = draftInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error:
        "This course is not ready to save: check the title, description and every lesson's blocks.",
    };
  }

  const instructor = await requireInstructor();
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
      error: "The course could not be saved. Your work is still on screen — try again.",
    };
  }
}
