import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  CourseCatalog,
  type CourseCardData,
} from "@/components/courses/course-catalog";
import { Skeleton } from "@/components/ui/skeleton";
import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import {
  countLessons,
  flattenLessons,
  listPublishedCourses,
  totalMinutes,
} from "@/lib/courses";
import { CONTENT_LANGUAGES } from "@/i18n/config";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("courses.title"),
    description: t("courses.subtitle"),
  };
}

/** Dictionary keys for the two enums shown as badges. */
const DIFFICULTY_KEYS: Record<string, string> = {
  beginner: "courses.difficulty.beginner",
  intermediate: "courses.difficulty.intermediate",
  advanced: "courses.difficulty.advanced",
};

const SOURCE_KEYS: Record<string, string> = {
  SEED: "courses.source.seed",
  AI_GENERATED: "courses.source.ai",
  INSTRUCTOR: "courses.source.instructor",
  LEARNER: "courses.source.learner",
};

/**
 * Catalog of published courses.
 *
 * Drafts never reach this page (`status: PUBLISHED` in the query), so a brand
 * new account only sees what an instructor has actually released.
 */
async function PublishedCatalog() {
  // Prisma reads and the session must stay out of the prerender pass.
  await connection();
  const [session, { t }] = await Promise.all([auth(), getI18n()]);
  const userId = session?.user?.id;

  const [courses, enrollments] = await Promise.all([
    listPublishedCourses(),
    userId === undefined
      ? Promise.resolve([])
      : prisma.enrollment.findMany({
          where: { userId },
          select: { courseId: true },
        }),
  ]);

  const enrolledIds = new Set(enrollments.map((row) => row.courseId));

  const cards: CourseCardData[] = courses.map((course) => {
    const blockTypes = [
      ...new Set(flattenLessons(course).flatMap((lesson) => lesson.blockTypes)),
    ];

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      topic: course.topic,
      audience: course.audience,
      difficulty: course.difficulty,
      coverEmoji: course.coverEmoji,
      sourceLabel:
        SOURCE_KEYS[course.source] === undefined
          ? course.source
          : t(SOURCE_KEYS[course.source] as string),
      difficultyLabel:
        DIFFICULTY_KEYS[course.difficulty] === undefined
          ? course.difficulty
          : t(DIFFICULTY_KEYS[course.difficulty] as string),
      languageLabel: t("courses.contentLanguage", {
        language: CONTENT_LANGUAGES[course.language] ?? course.language,
      }),
      lessonCount: countLessons(course),
      minutes: totalMinutes(course),
      blockTypes,
      enrolled: enrolledIds.has(course.id),
    };
  });

  return <CourseCatalog courses={cards} />;
}

export default async function CoursesPage() {
  const { t } = await getI18n();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <header className="mb-8 max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold">{t("courses.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("courses.subtitle")}</p>
      </header>

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton className="h-56 w-full rounded-xl" key={index} />
            ))}
          </div>
        }
      >
        <PublishedCatalog />
      </Suspense>
    </main>
  );
}
