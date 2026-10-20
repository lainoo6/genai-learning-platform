import type { CourseStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Read model for the learner's own generated courses (P4.7).
 *
 * The source of truth is `Course.source = LEARNER` plus `createdById`: a course
 * is visible here only to the learner who generated it, and the public catalog
 * (see `lib/courses.ts`) deliberately excludes the same rows.
 */

export type GeneratedCourseSummary = {
  id: string;
  title: string;
  /** Kept so the history can flag a course an admin has taken down. */
  status: CourseStatus;
  lessonCount: number;
  /** First lesson in reading order, used by the "Open" link. */
  firstLessonId: string | null;
  createdAt: Date;
};

/** Every mini-course this learner generated, newest first. */
export async function listGeneratedCourses(
  userId: string,
): Promise<GeneratedCourseSummary[]> {
  const rows = await prisma.course.findMany({
    where: { createdById: userId, source: "LEARNER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      modules: {
        orderBy: { order: "asc" },
        select: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const lessons = row.modules.flatMap((courseModule) => courseModule.lessons);

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      lessonCount: lessons.length,
      firstLessonId: lessons[0]?.id ?? null,
      createdAt: row.createdAt,
    };
  });
}
