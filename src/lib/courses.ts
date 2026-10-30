import type {
  Course,
  CourseSource,
  Prisma,
  ProgressStatus,
} from "@prisma/client";

import { blockListSchema, type BlockType } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";

/**
 * Read-only course queries shared by the catalog, the detail page, the player
 * and the dashboard.
 *
 * `Lesson.blocks` is stored as JSON, so every read parses it back through the
 * block schema: invalid blocks are skipped instead of crashing the page, and
 * only the block count / types are surfaced to the UI.
 */

/** Difficulty values used by the seeded and generated courses. */
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const SOURCE_LABELS: Record<CourseSource, string> = {
  SEED: "Curated course",
  AI_GENERATED: "AI generated",
  INSTRUCTOR: "Instructor authored",
  LEARNER: "Learner generated",
};

export type CourseLesson = {
  id: string;
  moduleId: string;
  moduleTitle: string;
  moduleOrder: number;
  title: string;
  order: number;
  estimatedMinutes: number;
  blockCount: number;
  blockTypes: BlockType[];
};

export type CourseModule = {
  id: string;
  title: string;
  order: number;
  lessons: CourseLesson[];
};

export type CourseWithLessons = Pick<
  Course,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "topic"
  | "audience"
  | "difficulty"
  | "coverEmoji"
  | "language"
  | "source"
  | "status"
  | "isCurated"
  | "createdById"
  | "repoUrl"
  | "repoBranch"
  | "repoSelectedPaths"
> & {
  modules: CourseModule[];
};

const courseWithLessonsSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  topic: true,
  audience: true,
  difficulty: true,
  coverEmoji: true,
  language: true,
  source: true,
  status: true,
  isCurated: true,
  createdById: true,
  repoUrl: true,
  repoBranch: true,
  repoSelectedPaths: true,
  modules: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      order: true,
      lessons: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          estimatedMinutes: true,
          blocks: true,
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

type CourseRow = Prisma.CourseGetPayload<{
  select: typeof courseWithLessonsSelect;
}>;

/** Block types of a stored lesson payload, de-duplicated, order preserved. */
export function parseBlockTypes(blocks: Prisma.JsonValue): BlockType[] {
  const parsed = blockListSchema.safeParse(blocks);
  if (!parsed.success) {
    return [];
  }

  return [...new Set(parsed.data.map((block) => block.type))];
}

function toCourseWithLessons(row: CourseRow): CourseWithLessons {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    topic: row.topic,
    audience: row.audience,
    difficulty: row.difficulty,
    coverEmoji: row.coverEmoji,
    language: row.language,
    source: row.source,
    status: row.status,
    isCurated: row.isCurated,
    createdById: row.createdById,
    repoUrl: row.repoUrl,
    repoBranch: row.repoBranch,
    repoSelectedPaths: row.repoSelectedPaths,
    modules: row.modules.map((courseModule) => ({
      id: courseModule.id,
      title: courseModule.title,
      order: courseModule.order,
      lessons: courseModule.lessons.map((lesson) => {
        const blockTypes = parseBlockTypes(lesson.blocks);

        return {
          id: lesson.id,
          moduleId: courseModule.id,
          moduleTitle: courseModule.title,
          moduleOrder: courseModule.order,
          title: lesson.title,
          order: lesson.order,
          estimatedMinutes: lesson.estimatedMinutes,
          blockCount: blockTypes.length,
          blockTypes,
        };
      }),
    })),
  };
}

/** Lessons of a course flattened in reading order (module order, then lesson). */
export function flattenLessons(course: CourseWithLessons): CourseLesson[] {
  return course.modules.flatMap((courseModule) => courseModule.lessons);
}

export function countLessons(course: CourseWithLessons): number {
  return flattenLessons(course).length;
}

export function totalMinutes(course: CourseWithLessons): number {
  return flattenLessons(course).reduce(
    (sum, lesson) => sum + lesson.estimatedMinutes,
    0,
  );
}

/** First lesson in reading order, used by "Enroll" and "Continue". */
export function firstLesson(
  course: CourseWithLessons,
): CourseLesson | undefined {
  return flattenLessons(course)[0];
}

/**
 * Courses shown in the public catalog.
 *
 * Learner-generated courses (P4.7) are published so the player works, but they
 * belong to the learner who asked for them: they never appear in the catalog,
 * the recommendations or a public course page.
 */
export const PUBLIC_COURSE_WHERE = {
  status: "PUBLISHED",
  source: { not: "LEARNER" },
} satisfies Prisma.CourseWhereInput;

export async function listPublishedCourses(): Promise<CourseWithLessons[]> {
  const rows = await prisma.course.findMany({
    where: PUBLIC_COURSE_WHERE,
    orderBy: { createdAt: "asc" },
    select: courseWithLessonsSelect,
  });

  return rows.map(toCourseWithLessons);
}

export async function getPublishedCourseBySlug(
  slug: string,
): Promise<CourseWithLessons | null> {
  const row = await prisma.course.findFirst({
    where: { ...PUBLIC_COURSE_WHERE, slug },
    select: courseWithLessonsSelect,
  });

  return row === null ? null : toCourseWithLessons(row);
}

export async function getCourseById(
  courseId: string,
): Promise<CourseWithLessons | null> {
  const row = await prisma.course.findUnique({
    where: { id: courseId },
    select: courseWithLessonsSelect,
  });

  return row === null ? null : toCourseWithLessons(row);
}

/** Reads the stored `completedBlocks` JSON array, dropping malformed entries. */
export function readCompletedBlocks(
  value: Prisma.JsonValue | null | undefined,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

export type LessonProgressRecord = {
  lessonId: string;
  status: ProgressStatus;
  completedBlocks: string[];
  score: number | null;
};

/** Progress rows for the given lessons, keyed by lesson id. */
export async function listLessonProgress(
  userId: string,
  lessonIds: string[],
): Promise<Map<string, LessonProgressRecord>> {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, lessonId: { in: lessonIds } },
    select: { lessonId: true, status: true, completedBlocks: true, score: true },
  });

  return new Map(
    rows.map((row) => [
      row.lessonId,
      {
        lessonId: row.lessonId,
        status: row.status,
        completedBlocks: readCompletedBlocks(row.completedBlocks),
        score: row.score,
      },
    ]),
  );
}

export type EnrolledCourse = {
  course: CourseWithLessons;
  enrolledAt: Date;
  completedAt: Date | null;
};

/** Every course the user enrolled in, newest first, with its full structure. */
export async function listEnrolledCourses(
  userId: string,
): Promise<EnrolledCourse[]> {
  const rows = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      completedAt: true,
      course: { select: courseWithLessonsSelect },
    },
  });

  return rows.map((row) => ({
    course: toCourseWithLessons(row.course),
    enrolledAt: row.createdAt,
    completedAt: row.completedAt,
  }));
}
