import type { CourseSource, CourseStatus, Prisma } from "@prisma/client";

import { blockListSchema, blockSchema, type Block } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";
import type {
  EditorCourse,
  EditorLesson,
  EditorModule,
} from "@/lib/teach-editor";

/**
 * Read model for the instructor home page (P4.6).
 *
 * The list is scoped to courses the caller created, which is also the ownership
 * rule for editing: `createdById` is the only authority the teacher surfaces
 * use. Learner self-generated courses (P4.7) are created by the same users when
 * they browse as learners, so they are excluded here — the teaching list is
 * about material this person authored, not about what they are studying.
 */

export type TaughtCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: CourseStatus;
  source: CourseSource;
  difficulty: string;
  coverEmoji: string;
  moduleCount: number;
  lessonCount: number;
  updatedAt: Date;
};

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/** Every course the user authored, newest edit first. */
export async function listTaughtCourses(userId: string): Promise<TaughtCourse[]> {
  const rows = await prisma.course.findMany({
    where: {
      createdById: userId,
      source: { in: ["AI_GENERATED", "INSTRUCTOR"] },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      source: true,
      difficulty: true,
      coverEmoji: true,
      updatedAt: true,
      modules: {
        select: {
          id: true,
          lessons: { select: { id: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    source: row.source,
    difficulty: row.difficulty,
    coverEmoji: row.coverEmoji,
    moduleCount: row.modules.length,
    lessonCount: row.modules.reduce(
      (sum, courseModule) => sum + courseModule.lessons.length,
      0,
    ),
    updatedAt: row.updatedAt,
  }));
}

/**
 * Full editable snapshot of a course, for `/teach/courses/[id]/edit`.
 *
 * Every lesson is read with its stored JSON blocks. A payload that no longer
 * matches the block schema is not allowed to take the whole page down: blocks
 * that parse individually are kept, and the rest are counted so the editor can
 * warn before the author saves over them.
 */
const editorCourseSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  topic: true,
  audience: true,
  difficulty: true,
  coverEmoji: true,
  status: true,
  source: true,
  createdById: true,
  modules: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      lessons: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          estimatedMinutes: true,
          blocks: true,
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

/** Splits a stored block array into the blocks that parse and the ones that do not. */
function readEditableBlocks(value: Prisma.JsonValue): {
  blocks: Block[];
  dropped: number;
} {
  const list = blockListSchema.safeParse(value);
  if (list.success) {
    return { blocks: list.data, dropped: 0 };
  }

  if (!Array.isArray(value)) {
    return { blocks: [], dropped: 0 };
  }

  const blocks: Block[] = [];
  for (const entry of value) {
    const block = blockSchema.safeParse(entry);
    if (block.success) {
      blocks.push(block.data);
    }
  }

  return { blocks, dropped: value.length - blocks.length };
}

export async function loadEditorCourse(
  courseId: string,
): Promise<EditorCourse | null> {
  const row = await prisma.course.findUnique({
    where: { id: courseId },
    select: editorCourseSelect,
  });

  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    topic: row.topic,
    audience: row.audience,
    difficulty: row.difficulty,
    coverEmoji: row.coverEmoji,
    status: row.status,
    source: row.source,
    createdById: row.createdById,
    modules: row.modules.map((courseModule): EditorModule => ({
      id: courseModule.id,
      title: courseModule.title,
      lessons: courseModule.lessons.map((lesson): EditorLesson => {
        const parsed = readEditableBlocks(lesson.blocks);

        return {
          id: lesson.id,
          title: lesson.title,
          estimatedMinutes: lesson.estimatedMinutes,
          blocks: parsed.blocks,
          droppedBlocks: parsed.dropped,
        };
      }),
    })),
  };
}

