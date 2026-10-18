import type { CourseSource, CourseStatus, Role } from "@prisma/client";

import {
  countActiveLearners,
  loadDailyActive,
  type DailyActivityPoint,
} from "@/lib/insights";
import { prisma } from "@/lib/prisma";

/**
 * Read model for the admin console (P5.4).
 *
 * Users, courses and the platform overview are three independent queries, each
 * built for the tab that renders it. "Last login" is derived from the LOGIN
 * engagement event (P2 wrote one per successful sign-in) because the fixed data
 * model has no dedicated column, and the plan does not allow adding one.
 */

export const COURSE_SOURCE_LABELS: Record<CourseSource, string> = {
  SEED: "Seed",
  AI_GENERATED: "AI generated",
  INSTRUCTOR: "Authored",
  LEARNER: "Learner-made",
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
  enrolledCourses: number;
  authoredCourses: number;
};

export type AdminUserQuery = {
  /** Case-insensitive match against name and email. */
  search: string;
  /** `null` means every role. */
  role: Role | null;
};

/** Users matching the filters, newest registration first. */
export async function listAdminUsers(
  query: AdminUserQuery,
): Promise<AdminUserRow[]> {
  const search = query.search.trim();

  const rows = await prisma.user.findMany({
    where: {
      ...(query.role === null ? {} : { role: query.role }),
      ...(search.length === 0
        ? {}
        : {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { enrollments: true, createdCourses: true } },
    },
  });

  const userIds = rows.map((row) => row.id);
  const loginGroups = await prisma.engagementEvent.groupBy({
    by: ["userId"],
    where: { type: "LOGIN", userId: { in: userIds } },
    _max: { createdAt: true },
  });

  const lastLoginByUser = new Map<string, Date>();
  for (const group of loginGroups) {
    if (group.userId !== null && group._max.createdAt !== null) {
      lastLoginByUser.set(group.userId, group._max.createdAt);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    lastLoginAt: lastLoginByUser.get(row.id) ?? null,
    enrolledCourses: row._count.enrollments,
    authoredCourses: row._count.createdCourses,
  }));
}

export type AdminCourseRow = {
  id: string;
  slug: string;
  title: string;
  status: CourseStatus;
  source: CourseSource;
  coverEmoji: string;
  creatorName: string;
  creatorEmail: string;
  studentCount: number;
  lessonCount: number;
  updatedAt: Date;
};

/**
 * Every course on the platform, including drafts and learner-made ones.
 *
 * The admin list is deliberately unfiltered: the teacher surfaces only show
 * authored courses, and moderation needs to see exactly what they hide.
 */
export async function listAdminCourses(): Promise<AdminCourseRow[]> {
  const rows = await prisma.course.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      source: true,
      coverEmoji: true,
      updatedAt: true,
      createdBy: { select: { name: true, email: true } },
      _count: { select: { enrollments: true } },
      modules: { select: { _count: { select: { lessons: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    source: row.source,
    coverEmoji: row.coverEmoji,
    creatorName: row.createdBy.name,
    creatorEmail: row.createdBy.email,
    studentCount: row._count.enrollments,
    lessonCount: row.modules.reduce(
      (sum, courseModule) => sum + courseModule._count.lessons,
      0,
    ),
    updatedAt: row.updatedAt,
  }));
}

export type AdminOverview = {
  userCount: number;
  courseCount: number;
  publishedCount: number;
  activeLast7Days: number;
  dailyActivity: DailyActivityPoint[];
};

/** Platform-wide counters plus the 30-day activity line. */
export async function loadAdminOverview(): Promise<AdminOverview> {
  const [userCount, courseCount, publishedCount, activeLast7Days, dailyActivity] =
    await Promise.all([
      prisma.user.count(),
      prisma.course.count(),
      prisma.course.count({ where: { status: "PUBLISHED" } }),
      countActiveLearners({ days: 7 }),
      loadDailyActive({ days: 30 }),
    ]);

  return {
    userCount,
    courseCount,
    publishedCount,
    activeLast7Days,
    dailyActivity,
  };
}
