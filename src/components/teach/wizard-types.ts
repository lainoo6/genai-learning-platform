import type { Block, BlockType } from "@/lib/blocks/schema";
import type { GeneratedLesson } from "@/lib/llm/prompts/lesson";
import type {
  Audience,
  AuthoringDifficulty,
  CourseOutline,
} from "@/lib/llm/prompts/outline";

/**
 * Shared state shapes for the course wizard (P4.6).
 *
 * The wizard keeps working data in the browser between steps: the outline is
 * edited in place and every generated lesson stays in memory until "Save as
 * draft". Nothing here touches the database until the very last step, which is
 * what makes a failed generation recoverable.
 *
 * The outline carries a `key` on every module and lesson. Keys (not array
 * indices) identify rows while the instructor deletes and reorders them, so an
 * open input never jumps to a different lesson mid-edit.
 */

export type CourseFormValues = {
  topic: string;
  audience: Audience;
  difficulty: AuthoringDifficulty;
  lessonCount: number;
  notes: string;
};

export const INITIAL_FORM: CourseFormValues = {
  topic: "",
  audience: "All learners",
  difficulty: "beginner",
  lessonCount: 4,
  notes: "",
};

export type WizardLesson = {
  key: string;
  title: string;
  summary: string;
  suggestedBlocks: BlockType[];
};

export type WizardModule = {
  key: string;
  title: string;
  lessons: WizardLesson[];
};

export type WizardOutline = {
  title: string;
  description: string;
  modules: WizardModule[];
};

/** One lesson's generation state; `lesson` survives a failed regeneration. */
export type LessonJob = {
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  lesson: GeneratedLesson | null;
};

export const EMPTY_JOB: LessonJob = {
  status: "idle",
  error: null,
  lesson: null,
};

export type FlattenedLesson = {
  moduleTitle: string;
  lesson: WizardLesson;
  /** 0-based position across the whole course. */
  index: number;
};

let keySeed = 0;

/** A key that is unique for the lifetime of the tab. */
export function nextWizardKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

/** Converts a generated outline into editable state. */
export function toWizardOutline(outline: CourseOutline): WizardOutline {
  return {
    title: outline.title,
    description: outline.description,
    modules: outline.modules.map((courseModule) => ({
      key: nextWizardKey("module"),
      title: courseModule.title,
      lessons: courseModule.lessons.map((lesson) => ({
        key: nextWizardKey("lesson"),
        title: lesson.title,
        summary: lesson.summary,
        suggestedBlocks: [...lesson.suggestedBlocks],
      })),
    })),
  };
}

/** Every lesson of the outline in reading order, with its module title. */
export function flattenWizardLessons(
  outline: WizardOutline,
): FlattenedLesson[] {
  let index = 0;

  return outline.modules.flatMap((courseModule) =>
    courseModule.lessons.map((lesson) => {
      const item: FlattenedLesson = {
        moduleTitle: courseModule.title,
        lesson,
        index,
      };
      index += 1;
      return item;
    }),
  );
}

/** Total number of lessons across all modules. */
export function countWizardLessons(outline: WizardOutline): number {
  return outline.modules.reduce(
    (sum, courseModule) => sum + courseModule.lessons.length,
    0,
  );
}

/** Total planned reading time, falling back to ten minutes per ungenerated row. */
export function totalWizardMinutes(
  outline: WizardOutline,
  jobs: Record<string, LessonJob>,
): number {
  return flattenWizardLessons(outline).reduce((sum, item) => {
    const lesson = jobs[item.lesson.key]?.lesson;
    return sum + (lesson?.estimatedMinutes ?? 10);
  }, 0);
}

export type DraftModule = {
  title: string;
  lessons: Array<{
    title: string;
    estimatedMinutes: number;
    blocks: Block[];
  }>;
};

/**
 * Builds the save payload, or `null` while any lesson is still missing.
 *
 * Modules left empty (every lesson deleted) are dropped so the saved course
 * never contains a module with nothing in it.
 */
export function toDraftModules(
  outline: WizardOutline,
  jobs: Record<string, LessonJob>,
): DraftModule[] | null {
  const modules: DraftModule[] = [];

  for (const courseModule of outline.modules) {
    const lessons: DraftModule["lessons"] = [];

    for (const lesson of courseModule.lessons) {
      const generated = jobs[lesson.key]?.lesson ?? null;
      if (generated === null) {
        return null;
      }

      lessons.push({
        title: lesson.title,
        estimatedMinutes: generated.estimatedMinutes,
        blocks: generated.blocks,
      });
    }

    if (lessons.length > 0) {
      modules.push({ title: courseModule.title, lessons });
    }
  }

  return modules.length === 0 ? null : modules;
}
