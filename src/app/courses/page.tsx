import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  CourseCatalog,
  type CourseCardData,
} from "@/components/courses/course-catalog";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import {
  countLessons,
  DIFFICULTY_LABELS,
  flattenLessons,
  listPublishedCourses,
  SOURCE_LABELS,
  totalMinutes,
} from "@/lib/courses";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse the interactive mini-courses published on the platform.",
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
  const session = await auth();
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
      sourceLabel: SOURCE_LABELS[course.source],
      difficultyLabel: DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty,
      lessonCount: countLessons(course),
      minutes: totalMinutes(course),
      blockTypes,
      enrolled: enrolledIds.has(course.id),
    };
  });

  return <CourseCatalog courses={cards} />;
}

export default function CoursesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <header className="mb-8 max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold">Course catalog</h1>
        <p className="text-sm text-muted-foreground">
          Short interactive courses built from reading, quizzes, flashcards and
          hands-on activities. Pick one and learn at your own pace.
        </p>
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
