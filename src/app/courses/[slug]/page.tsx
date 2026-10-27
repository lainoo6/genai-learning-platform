import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { CourseDetail } from "@/components/courses/course-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { firstLesson, getPublishedCourseBySlug } from "@/lib/courses";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Course landing page: outline plus the enroll action.
 *
 * Only published courses resolve here — drafts and archived courses 404, which
 * is why the catalog can link freely without leaking unreleased content.
 */
async function CourseDetailView({ params }: PageProps) {
  await connection();
  const { slug } = await params;

  const course = await getPublishedCourseBySlug(slug);
  if (course === null) {
    notFound();
  }

  const session = await auth();
  const userId = session?.user?.id;
  await trackEvent("COURSE_VIEW", {
    userId,
    courseId: course.id,
    payload: { slug },
  });

  const enrollment =
    userId === undefined
      ? null
      : await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId, courseId: course.id } },
          select: { id: true },
        });

  const lesson = firstLesson(course);

  return (
    <CourseDetail
      course={course}
      enrolled={enrollment !== null}
      firstLessonHref={
        lesson === undefined ? null : `/learn/${course.id}/${lesson.id}`
      }
    />
  );
}

export default function CourseDetailPage({ params }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CourseDetailView params={params} />
      </Suspense>
    </main>
  );
}
