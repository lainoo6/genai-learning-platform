import { z } from "zod";

import { blockListSchema, type Block } from "@/lib/blocks/schema";
import { validateGameActivity } from "@/lib/game-activity";
import type { ContentLanguage } from "@/lib/llm/language";

/**
 * Shared model for the instructor course editor (P5.1).
 *
 * The editor is a client component, so nothing in this module may import the
 * Prisma client or any Node-only module: the same file is used by the server
 * page (to type the loaded course) and by the browser bundle (to validate a
 * draft before it is sent to the server action).
 */

export const EDITOR_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type EditorStatus = (typeof EDITOR_STATUSES)[number];

/** Dictionary keys: the editor renders these badges in the UI language. */
export const EDITOR_STATUS_KEYS: Record<EditorStatus, string> = {
  DRAFT: "editor.status.draft",
  PUBLISHED: "editor.status.published",
  ARCHIVED: "editor.status.archived",
};

export const EDITOR_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type EditorDifficulty = (typeof EDITOR_DIFFICULTIES)[number];

export const EDITOR_DIFFICULTY_KEYS: Record<EditorDifficulty, string> = {
  beginner: "courses.difficulty.beginner",
  intermediate: "courses.difficulty.intermediate",
  advanced: "courses.difficulty.advanced",
};

/**
 * Audience suggestions for the settings form.
 *
 * The field stays free text: courses authored by the AI wizard and the seed
 * data already use wording that is not in this list ("Non-CS beginners"), and
 * opening the editor must never force a rename.
 */
export const AUDIENCE_SUGGESTIONS = [
  "Non-CS learners",
  "Non-CS beginners",
  "CS students",
  "All learners",
] as const;

/** Suggestions offered when the editor runs in Chinese. */
export const AUDIENCE_SUGGESTIONS_ZH = [
  "非计算机专业学习者",
  "计算机专业学生",
  "所有学习者",
] as const;

export type EditorSource = "SEED" | "AI_GENERATED" | "INSTRUCTOR" | "LEARNER";

/** One lesson as the editor holds it: its stored blocks plus a repair counter. */
export type EditorLesson = {
  id: string;
  title: string;
  estimatedMinutes: number;
  blocks: Block[];
  /**
   * Blocks that are stored on the lesson but no longer match the schema. They
   * are left out of `blocks`, so saving replaces them; the editor warns before
   * the author loses anything.
   */
  droppedBlocks: number;
};

export type EditorModule = {
  id: string;
  title: string;
  lessons: EditorLesson[];
};

export type EditorCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  topic: string;
  audience: string;
  difficulty: string;
  coverEmoji: string;
  language: ContentLanguage;
  status: EditorStatus;
  source: EditorSource;
  createdById: string;
  modules: EditorModule[];
};

/**
 * What the editor sends back. Ids are chosen by the client, so a lesson created
 * in this session can be saved without a round trip to learn its id.
 */
export const editorLessonSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(2, "Give the lesson a title of at least two characters.")
    .max(120),
  estimatedMinutes: z.number().int().min(1).max(120),
  blocks: blockListSchema,
});

export const editorModuleSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(1, "Give the module a title.")
    .max(80),
  lessons: z.array(editorLessonSchema).min(1),
});

/**
 * The full course snapshot, validated as one unit.
 *
 * Blocks are part of this schema, so a malformed block is rejected by the same
 * pass that rejects an empty title — nothing reaches the database unless the
 * whole lesson list is renderable by the player.
 */
export const editorCourseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "The course title needs at least three characters.")
      .max(90),
    description: z
      .string()
      .trim()
      .min(20, "Write a description of at least 20 characters.")
      .max(600),
    audience: z.string().trim().min(1, "Say who the course is for.").max(80),
    difficulty: z.enum(EDITOR_DIFFICULTIES),
    coverEmoji: z.string().trim().min(1, "Pick a cover emoji.").max(8),
    language: z.enum(["en", "zh"]).default("en"),
    status: z.enum(EDITOR_STATUSES),
    modules: z.array(editorModuleSchema).min(1, "A course needs a module."),
  })
  .superRefine((course, ctx) => {
    const blockCount = course.modules.reduce(
      (total, courseModule) =>
        total
        + courseModule.lessons.reduce(
          (lessonTotal, lesson) => lessonTotal + lesson.blocks.length,
          0,
        ),
      0,
    );

    if (course.status === "PUBLISHED" && blockCount === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Add at least one block before publishing this course.",
      });
    }

    if (course.status === "PUBLISHED") {
      for (const [moduleIndex, courseModule] of course.modules.entries()) {
        for (const [lessonIndex, lesson] of courseModule.lessons.entries()) {
          const challenges = lesson.blocks.filter(
            (block): block is Extract<Block, { type: "game" }> =>
              block.type === "game",
          );
          if (challenges.length === 0) continue;
          const result = validateGameActivity(challenges, course.language);
          if (!result.ok) {
            ctx.addIssue({
              code: "custom",
              path: [
                "modules",
                moduleIndex,
                "lessons",
                lessonIndex,
                "blocks",
              ],
              message: result.errors.join(" "),
            });
          }
        }
      }
    }
  });

export type EditorCourseInput = z.input<typeof editorCourseSchema>;
