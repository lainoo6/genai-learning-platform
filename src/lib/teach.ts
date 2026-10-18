import type { CourseSource, CourseStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
