import type { Prisma, ProgressStatus } from "@prisma/client";

import { blockListSchema } from "@/lib/blocks/schema";
import { blockMetaFor } from "@/lib/blocks/meta";
import { prisma } from "@/lib/prisma";
import {
  completionPercent,
  listCourseStudents,
  loadRosterCourse,
  type CourseStudent,
  type RosterCourse,
} from "@/lib/students";

/**
 * Read model for the engagement dashboard (P5.3) and the platform overview in
 * the admin console (P5.4).
 *
 * Everything here is derived from the two sources of truth the product promises
 * to report on: `EngagementEvent` for activity and `LessonProgress` for
 * completion. No mock content is read, so switching the LLM mock on or off can
 * never move a number on these charts.
 */

export const ACTIVITY_WINDOW_DAYS = 30;
export const RECENT_WINDOW_DAYS = 7;

/** One point of the daily-activity line, keyed by local calendar day. */
export type DailyActivityPoint = {
  /** `YYYY-MM-DD` in the server's timezone. */
  date: string;
  active: number;
};

export type CourseLessonInsight = {
  id: string;
  title: string;
  moduleTitle: string;
  blockCount: number;
};

export type StudentLessonInsight = {
  lessonId: string;
  title: string;
  moduleTitle: string;
  status: ProgressStatus;
  score: number | null;
  completedBlocks: number;
  totalBlocks: number;
};

export type StudentInsight = CourseStudent & {
  /** Blocks this student finished inside this course, deduplicated. */
  blocksCompleted: number;
  /** Every lesson of the course, so the UI can expand a full breakdown. */
  lessons: StudentLessonInsight[];
};

export type BlockTypeSlice = {
  type: string;
  /** Dictionary key for the block type name; the chart translates it. */
  labelKey: string;
  count: number;
};

export type LessonCompletionRow = {
  lessonId: string;
  title: string;
  moduleTitle: string;
  completed: number;
  total: number;
};

export type CourseInsights = {
  course: RosterCourse;
  students: StudentInsight[];
  totalStudents: number;
  activeLast7Days: number;
  /** Mean of the per-student completion percentage, 0-100. */
  averageCompletion: number;
  /** Mean of the per-student quiz average as a ratio, null when unscored. */
  quizAverage: number | null;
  totalBlocksCompleted: number;
  dailyActivity: DailyActivityPoint[];
  lessonCompletion: LessonCompletionRow[];
  blockMix: BlockTypeSlice[];
};

/** Midnight of the local day that is `daysAgo` days before `now`. */
function startOfLocalDay(now: Date, daysAgo = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Distinct actors per calendar day over the last `days` days.
 *
 * One grouped query per day keeps the database doing the distinct counting: a
 * day returns at most one row per active person, so a chatty learner with a
 * hundred events never inflates the payload. Days without activity are kept at
 * zero so the line chart has a continuous axis.
 *
 * `courseId` narrows the window to one course (teacher dashboard); omitting it
 * counts platform-wide activity (admin overview).
 */
export async function loadDailyActive(options: {
  days: number;
  courseId?: string;
  now?: Date;
}): Promise<DailyActivityPoint[]> {
  const now = options.now ?? new Date();
  const days: Date[] = [];
  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    days.push(startOfLocalDay(now, offset));
  }

  const counts = await Promise.all(
    days.map(async (start) => {
      const end = startOfLocalDay(start, -1);
      const rows = await prisma.engagementEvent.groupBy({
        by: ["userId"],
        where: {
          userId: { not: null },
          createdAt: { gte: start, lt: end },
          ...(options.courseId === undefined
            ? {}
            : { courseId: options.courseId }),
        },
      });

      return rows.length;
    }),
  );

  return days.map((start, index) => ({
    date: dayKey(start),
    active: counts[index] ?? 0,
  }));
}

/** Distinct actors with at least one event in the last `days` days. */
export async function countActiveLearners(options: {
  days: number;
  courseId?: string;
  now?: Date;
}): Promise<number> {
  const now = options.now ?? new Date();
  const start = startOfLocalDay(now, options.days - 1);

  const rows = await prisma.engagementEvent.groupBy({
    by: ["userId"],
    where: {
      userId: { not: null },
      createdAt: { gte: start },
      ...(options.courseId === undefined ? {} : { courseId: options.courseId }),
    },
  });

  return rows.length;
}

/** Reads `LessonProgress.completedBlocks`, dropping anything malformed. */
function readCompletedBlockIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

type ProgressRow = {
  userId: string;
  lessonId: string;
  status: ProgressStatus;
  score: number | null;
  completedBlocks: Prisma.JsonValue;
};

/**
 * Everything `/teach/courses/[id]/insights` renders, in one call.
 *
 * Per-student totals come from `listCourseStudents`, the same read model the
 * roster and the CSV export use, so the dashboard can never disagree with the
 * student table. The extra query in here only adds the lesson-level breakdown
 * and the block-type tally needed for the pie chart.
 */
export async function loadCourseInsights(
  courseId: string,
): Promise<CourseInsights | null> {
  const course = await loadRosterCourse(courseId);
  if (course === null) {
    return null;
  }

  const [modules, students, dailyActivity, activeLast7Days] = await Promise.all([
    prisma.module.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      select: {
        title: true,
        lessons: {
          orderBy: { order: "asc" },
          select: { id: true, title: true, blocks: true },
        },
      },
    }),
    listCourseStudents(courseId),
    loadDailyActive({ courseId, days: ACTIVITY_WINDOW_DAYS }),
    countActiveLearners({ courseId, days: RECENT_WINDOW_DAYS }),
  ]);

  // Lessons in course order, plus the block id → type map used by the pie.
  const lessons: CourseLessonInsight[] = [];
  const blockTypeById = new Map<string, string>();
  const blockTypeTotals = new Map<string, number>();

  for (const courseModule of modules) {
    for (const lesson of courseModule.lessons) {
      const parsedBlocks = blockListSchema.safeParse(lesson.blocks);
      const blocks = parsedBlocks.success ? parsedBlocks.data : [];

      lessons.push({
        id: lesson.id,
        title: lesson.title,
        moduleTitle: courseModule.title,
        blockCount: blocks.length,
      });

      for (const block of blocks) {
        blockTypeById.set(block.id, block.type);
        if (!blockTypeTotals.has(block.type)) {
          blockTypeTotals.set(block.type, 0);
        }
      }
    }
  }

  const lessonIds = lessons.map((lesson) => lesson.id);
  const studentIds = students.map((student) => student.userId);

  const progressRows: ProgressRow[] =
    lessonIds.length === 0 || studentIds.length === 0
      ? []
      : await prisma.lessonProgress.findMany({
          where: {
            userId: { in: studentIds },
            lessonId: { in: lessonIds },
          },
          select: {
            userId: true,
            lessonId: true,
            status: true,
            score: true,
            completedBlocks: true,
          },
        });

  const rowsByStudent = new Map<string, ProgressRow[]>();
  const completedByLesson = new Map<string, number>();
  const blocksByStudent = new Map<string, number>();
  const blockTypeCounts = new Map<string, number>();

  for (const row of progressRows) {
    const rows = rowsByStudent.get(row.userId);
    if (rows === undefined) {
      rowsByStudent.set(row.userId, [row]);
    } else {
      rows.push(row);
    }

    if (row.status === "COMPLETED") {
      completedByLesson.set(
        row.lessonId,
        (completedByLesson.get(row.lessonId) ?? 0) + 1,
      );
    }

    const completedIds = readCompletedBlockIds(row.completedBlocks);
    let counted = blocksByStudent.get(row.userId) ?? 0;

    for (const blockId of completedIds) {
      const type = blockTypeById.get(blockId);
      if (type === undefined) {
        continue;
      }

      counted += 1;
      blockTypeCounts.set(type, (blockTypeCounts.get(type) ?? 0) + 1);
    }

    blocksByStudent.set(row.userId, counted);
  }

  const studentInsights: StudentInsight[] = students.map((student) => {
    const rows = rowsByStudent.get(student.userId) ?? [];
    const rowByLesson = new Map(rows.map((row) => [row.lessonId, row]));

    return {
      ...student,
      blocksCompleted: blocksByStudent.get(student.userId) ?? 0,
      lessons: lessons.map((lesson) => {
        const row = rowByLesson.get(lesson.id);

        return {
          lessonId: lesson.id,
          title: lesson.title,
          moduleTitle: lesson.moduleTitle,
          status: row?.status ?? "NOT_STARTED",
          score: row?.score ?? null,
          completedBlocks:
            row === undefined
              ? 0
              : readCompletedBlockIds(row.completedBlocks).filter((blockId) =>
                  blockTypeById.has(blockId),
                ).length,
          totalBlocks: lesson.blockCount,
        };
      }),
    };
  });

  const averageCompletion =
    studentInsights.length === 0
      ? 0
      : Math.round(
          studentInsights.reduce(
            (sum, student) => sum + completionPercent(student),
            0,
          ) / studentInsights.length,
        );

  const scoredAverages = studentInsights.flatMap((student) =>
    student.quizAverage === null ? [] : [student.quizAverage],
  );
  const quizAverage =
    scoredAverages.length === 0
      ? null
      : scoredAverages.reduce((sum, value) => sum + value, 0) /
        scoredAverages.length;

  const blockMix = [...blockTypeTotals.keys()]
    .map((type) => ({
      type,
      labelKey: blockMetaFor(type).labelKey,
      count: blockTypeCounts.get(type) ?? 0,
    }))
    .filter((slice) => slice.count > 0)
    .sort((first, second) => second.count - first.count);

  return {
    course,
    students: studentInsights,
    totalStudents: studentInsights.length,
    activeLast7Days,
    averageCompletion,
    quizAverage,
    totalBlocksCompleted: studentInsights.reduce(
      (sum, student) => sum + student.blocksCompleted,
      0,
    ),
    dailyActivity,
    lessonCompletion: lessons.map((lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      moduleTitle: lesson.moduleTitle,
      completed: completedByLesson.get(lesson.id) ?? 0,
      total: studentInsights.length,
    })),
    blockMix,
  };
}
