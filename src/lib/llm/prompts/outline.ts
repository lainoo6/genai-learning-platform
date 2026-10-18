import { z } from "zod";

import type { BlockType } from "@/lib/blocks/schema";

/**
 * Course outline generation for the instructor wizard (P4.6).
 *
 * Step 2 of the wizard asks the model for a title, a description and one to
 * three modules of lessons. Only the *plan* is generated here: each lesson is
 * written later, one at a time, from the summary and the suggested block types
 * (see `lesson.ts`). Splitting the work keeps a single failure cheap — a lesson
 * that fails to generate never costs the instructor the outline.
 *
 * The audience and difficulty values double as the wizard form options, so the
 * prompt, the form and the saved course all speak the same vocabulary.
 */

/** Audience choices offered in the wizard's first step. */
export const AUDIENCES = [
  "Non-CS learners",
  "CS students",
  "All learners",
] as const;

export const audienceSchema = z.enum(AUDIENCES);
export type Audience = (typeof AUDIENCES)[number];

/** Difficulty choices offered in the wizard's first step. */
export const AUTHORING_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const authoringDifficultySchema = z.enum(AUTHORING_DIFFICULTIES);
export type AuthoringDifficulty = (typeof AUTHORING_DIFFICULTIES)[number];

export const LESSON_COUNT_MIN = 3;
export const LESSON_COUNT_MAX = 8;

/**
 * Block types the outline may suggest.
 *
 * Kept as a literal tuple (rather than derived from `blockSchema`) because the
 * prompt needs a stable, readable list; the `satisfies` clause makes
 * TypeScript reject any entry that is not a real block type.
 */
export const SUGGESTED_BLOCK_TYPES = [
  "reading",
  "slides",
  "quiz",
  "flashcards",
  "reflection",
  "coding",
  "game",
  "simulation",
  "roleplay",
] as const satisfies readonly BlockType[];

export const suggestedBlockTypeSchema = z.enum(SUGGESTED_BLOCK_TYPES);

/** One planned lesson: its title, what it teaches, and the activities it needs. */
export const outlineLessonSchema = z.object({
  title: z.string().min(2).max(120),
  summary: z.string().min(10).max(400),
  suggestedBlocks: z.array(suggestedBlockTypeSchema).min(2).max(5),
});

/** One module: a title and at least one lesson. */
export const outlineModuleSchema = z.object({
  title: z.string().min(2).max(80),
  lessons: z.array(outlineLessonSchema).min(1).max(LESSON_COUNT_MAX),
});

/** The whole outline the model has to return. */
export const courseOutlineSchema = z
  .object({
    title: z.string().min(3).max(90),
    description: z.string().min(20).max(600),
    modules: z.array(outlineModuleSchema).min(1).max(3),
  })
  .superRefine((outline, ctx) => {
    const total = outline.modules.reduce(
      (sum, courseModule) => sum + courseModule.lessons.length,
      0,
    );

    if (total < LESSON_COUNT_MIN || total > LESSON_COUNT_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `The outline must contain ${LESSON_COUNT_MIN} to ${LESSON_COUNT_MAX} lessons in total (it has ${total}).`,
        path: ["modules"],
      });
    }
  });

export type CourseOutline = z.infer<typeof courseOutlineSchema>;
export type OutlineLesson = z.infer<typeof outlineLessonSchema>;

/** Everything step 1 collects before the outline is generated. */
export type OutlineRequest = {
  topic: string;
  audience: Audience;
  difficulty: AuthoringDifficulty;
  lessonCount: number;
  /** Free-text requirements from the author; may be empty. */
  notes: string;
};

/**
 * Prompt for the outline.
 *
 * The JSON skeleton and the per-lesson rules are spelled out because the reply
 * is parsed directly by `courseOutlineSchema`, and the `summary` /
 * `suggestedBlocks` fields are what the per-lesson prompt is later built from.
 */
export function courseOutlinePrompt(request: OutlineRequest): string {
  const notes =
    request.notes.trim().length === 0
      ? "None."
      : request.notes.trim();

  return [
    "You are an instructional designer planning a short interactive course for",
    "an online learning platform. Plan only: the lessons are written later,",
    "one at a time, from your summaries.",
    "",
    `Topic: ${request.topic}`,
    `Audience: ${request.audience}`,
    `Difficulty: ${request.difficulty}`,
    `Requested length: exactly ${request.lessonCount} lessons in total.`,
    "Author's notes:",
    notes,
    "",
    "Rules:",
    "- Group the lessons into one to three modules. Every module needs a short",
    "  concrete title, not \"Module 1\".",
    "- The whole outline must contain exactly the requested number of lessons.",
    "- A lesson title is concrete and specific (\"Reading a commit history\"),",
    "  never \"Lesson 1\".",
    "- `summary` is one or two sentences describing what the learner can do",
    "  after the lesson. It is the brief the lesson writer will follow, so name",
    "  the ideas and the example, not the activity.",
    "- `suggestedBlocks` lists two to five block types in the order they should",
    "  appear, chosen from: reading, slides, quiz, flashcards, reflection,",
    "  coding, game, simulation, roleplay.",
    "- Always include \"reading\" and \"quiz\". Add interactive blocks only when",
    "  they fit the content: coding for programming, roleplay for interviews and",
    "  soft skills, simulation for decisions, game or flashcards for recall.",
    "- Do not use emoji. Do not wrap the reply in code fences.",
    "",
    "Reply with one JSON object of this exact shape:",
    '{"title": string, "description": string, "modules": [{"title": string,',
    ' "lessons": [{"title": string, "summary": string,',
    '              "suggestedBlocks": BlockType[]}]}]}',
  ].join("\n");
}

/**
 * Fixed demo outline used when no API key is configured.
 *
 * It is a real three-lesson course about Git — intentionally the same example
 * the task's acceptance run uses — so the wizard's four steps can be walked
 * end to end without a key.
 */
export function mockCourseOutline(): unknown {
  return {
    title: "Introduction to Git for beginners",
    description:
      "A short, hands-on introduction to version control with Git: why a "
      + "project needs a history, how a commit is built, and how branches let "
      + "you experiment without risking working code.",
    modules: [
      {
        title: "The history of a project",
        lessons: [
          {
            title: "Why version control exists",
            summary:
              "Explain the problem Git solves: a project needs a record of what "
              + "changed, when, and why, so work can be undone and shared safely.",
            suggestedBlocks: ["reading", "slides", "quiz"],
          },
          {
            title: "Your first commit",
            summary:
              "Trace one change from the working tree through the staging area "
              + "into a commit, and read the history that results from it.",
            suggestedBlocks: ["reading", "flashcards", "quiz"],
          },
          {
            title: "Branches without fear",
            summary:
              "Create a branch, switch between branches and merge work back, "
              + "including what a conflict actually is and why it happens.",
            suggestedBlocks: ["reading", "game", "quiz"],
          },
        ],
      },
    ],
  };
}
