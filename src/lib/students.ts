import type { CourseStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Read model for the instructor roster (P5.2) and the progress CSV (P5.5).
 *
 * Each row combines three sources: the enrollment (who joined when), the
 * completed lesson progress of this course, and the last engagement event tied
 * to the course. All aggregation happens in the database — the roster page and
 * the streaming export share the same shape and the same numbers.
 */

export type RosterCourse = {
  id: string;
  slug: string;
  title: string;
  coverEmoji: string;
  status: CourseStatus;
  createdById: string;
};

export type CourseStudent = {
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
  completedLessons: number;
  totalLessons: number;
  /** Average quiz score as a ratio in [0, 1]; null when no quiz was scored. */
  quizAverage: number | null;
  lastActiveAt: Date | null;
};

const rosterCourseSelect = {
  id: true,
  slug: true,
  title: true,
  coverEmoji: true,
  status: true,
  createdById: true,
} satisfies Prisma.CourseSelect;

export async function loadRosterCourse(
  courseId: string,
): Promise<RosterCourse | null> {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: rosterCourseSelect,
  });
}

/** Ids of every lesson in the course, in no particular order. */
export async function listCourseLessonIds(courseId: string): Promise<string[]> {
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId } },
    select: { id: true },
  });

  return lessons.map((lesson) => lesson.id);
}

const enrollmentSelect = {
  id: true,
  userId: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.EnrollmentSelect;

type EnrollmentRow = Prisma.EnrollmentGetPayload<{
  select: typeof enrollmentSelect;
}>;

function latestDate(first: Date | null, second: Date | null): Date | null {
  if (first === null) {
    return second;
  }
  if (second === null) {
    return first;
  }

  return first > second ? first : second;
}

/**
 * Adds progress and activity to a page of enrollments.
 *
 * Kept separate from the queries so the roster page (all rows) and the export
 * (paged) can reuse exactly the same calculations.
 */
async function hydrateStudents(
  courseId: string,
  lessonIds: string[],
  rows: EnrollmentRow[],
): Promise<CourseStudent[]> {
  if (rows.length === 0) {
    return [];
  }

  const userIds = rows.map((row) => row.userId);

  const [
    completedGroups,
    scoreGroups,
    progressActivityGroups,
    eventActivityGroups,
  ] = await Promise.all([
    prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        lessonId: { in: lessonIds },
        status: "COMPLETED",
      },
      _count: { _all: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        lessonId: { in: lessonIds },
        score: { not: null },
      },
      _avg: { score: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, lessonId: { in: lessonIds } },
      _max: { updatedAt: true },
    }),
    prisma.engagementEvent.groupBy({
      by: ["userId"],
      where: { courseId, userId: { in: userIds } },
      _max: { createdAt: true },
    }),
  ]);

  const completedByUser = new Map(
    completedGroups.map((group) => [group.userId, group._count._all]),
  );
  const scoreByUser = new Map(
    scoreGroups.map((group) => [group.userId, group._avg.score]),
  );

  const progressActivityByUser = new Map<string, Date>();
  for (const group of progressActivityGroups) {
    if (group._max.updatedAt !== null) {
      progressActivityByUser.set(group.userId, group._max.updatedAt);
    }
  }

  const eventActivityByUser = new Map<string, Date>();
  for (const group of eventActivityGroups) {
    if (group.userId !== null && group._max.createdAt !== null) {
      eventActivityByUser.set(group.userId, group._max.createdAt);
    }
  }

  return rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    joinedAt: row.createdAt,
    completedLessons: completedByUser.get(row.userId) ?? 0,
    totalLessons: lessonIds.length,
    quizAverage: scoreByUser.get(row.userId) ?? null,
    lastActiveAt: latestDate(
      progressActivityByUser.get(row.userId) ?? null,
      eventActivityByUser.get(row.userId) ?? null,
    ),
  }));
}

/** Every student enrolled in the course, most recent enrolment first. */
export async function listCourseStudents(
  courseId: string,
): Promise<CourseStudent[]> {
  const [lessonIds, rows] = await Promise.all([
    listCourseLessonIds(courseId),
    prisma.enrollment.findMany({
      where: { courseId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: enrollmentSelect,
    }),
  ]);

  return hydrateStudents(courseId, lessonIds, rows);
}

const EXPORT_PAGE_SIZE = 200;

/**
 * Streams the roster for CSV export one enrolment page at a time.
 *
 * The export is read in ascending order with a cursor so memory stays flat no
 * matter how many students a course has: only one page of enrollments and its
 * aggregates is alive at any moment.
 */
export async function* iterateCourseStudents(
  courseId: string,
): AsyncGenerator<CourseStudent> {
  const lessonIds = await listCourseLessonIds(courseId);
  let cursor: string | null = null;

  for (;;) {
    const rows: EnrollmentRow[] = await prisma.enrollment.findMany({
      where: { courseId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_PAGE_SIZE,
      ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: enrollmentSelect,
    });

    if (rows.length === 0) {
      return;
    }

    const students = await hydrateStudents(courseId, lessonIds, rows);
    for (const student of students) {
      yield student;
    }

    const lastRow: EnrollmentRow | undefined = rows[rows.length - 1];
    if (rows.length < EXPORT_PAGE_SIZE || lastRow === undefined) {
      return;
    }

    cursor = lastRow.id;
  }
}

/** Column order of `course-<slug>-progress.csv` (P5.5). */
export const PROGRESS_CSV_HEADER = [
  "name",
  "email",
  "lessons_completed",
  "lessons_total",
  "completion_pct",
  "quiz_avg_score",
  "last_active",
] as const;

export function completionPercent(student: CourseStudent): number {
  if (student.totalLessons === 0) {
    return 0;
  }

  return Math.round((student.completedLessons / student.totalLessons) * 100);
}

/** One CSV record; `quiz_avg_score` is a percentage with one decimal. */
export function toProgressCsvCells(student: CourseStudent): string[] {
  return [
    student.name,
    student.email,
    String(student.completedLessons),
    String(student.totalLessons),
    String(completionPercent(student)),
    student.quizAverage === null
      ? ""
      : (student.quizAverage * 100).toFixed(1),
    student.lastActiveAt === null ? "" : student.lastActiveAt.toISOString(),
  ];
}

/** The import result types live with the read model so the UI can type them. */
export type ImportCredential = {
  name: string;
  email: string;
  password: string;
};

export type ImportFailure = {
  /** One-based record number in the uploaded file, header included. */
  row: number;
  email: string;
  reason: string;
};

export type ImportStudentsResult =
  | {
      ok: true;
      /** Data rows read from the file, blank lines excluded. */
      total: number;
      /** Rows enrolled by this run (new and existing accounts). */
      imported: number;
      /** Subset of `imported` that got a brand-new learner account. */
      newAccounts: number;
      /** Rows whose account was already enrolled in this course. */
      alreadyEnrolled: number;
      failed: ImportFailure[];
      /** Temporary passwords for the accounts created by this run, once. */
      credentials: ImportCredential[];
    }
  | { ok: false; error: string };
