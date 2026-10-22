import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth";
import { firstLesson, getCourseById } from "@/lib/courses";

type PageProps = {
  params: Promise<{ courseId: string }>;
};

/**
 * Entry point for "Preview as student" links.
 *
 * Teachers land here from a course page or the editor and are sent to the first
 * lesson with `?preview=1`. Preview mode never creates an enrollment, so this
 * is a safe alternative to pressing Enroll.
 */
export default async function CoursePreviewPage({ params }: PageProps) {
  await connection();

  const [{ courseId }, session] = await Promise.all([params, auth()]);

  const userId = session?.user?.id;
  if (userId === undefined) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/learn/${courseId}?preview=1`)}`,
    );
  }

  const role = session?.user?.role;
  if (role !== "INSTRUCTOR" && role !== "ADMIN") {
    redirect("/courses");
  }

  const course = await getCourseById(courseId);
  if (course === null) {
    notFound();
  }

  // Unpublished drafts are only previewable by their author (or an admin).
  if (
    course.status !== "PUBLISHED" &&
    role !== "ADMIN" &&
    course.createdById !== userId
  ) {
    notFound();
  }

  const lesson = firstLesson(course);
  if (lesson === undefined) {
    notFound();
  }

  redirect(`/learn/${course.id}/${lesson.id}?preview=1`);
}
