import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { CourseEditor } from "@/components/teach/editor/course-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { loadEditorCourse } from "@/lib/teach";

export const metadata: Metadata = {
  title: "Edit course",
};

type EditCoursePageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Instructor course editor (P5.1).
 *
 * The page only resolves the caller and loads the course: authorisation is
 * ownership, so a teacher who guesses another teacher's course id gets a 404
 * rather than a read-only view. Every write goes through the `saveCourse`
 * action, which repeats both checks.
 */
async function EditCourseContent({ params }: EditCoursePageProps) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const { id } = await params;

  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/teach/courses/${id}/edit`)}`,
    );
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    redirect("/");
  }

  const course = await loadEditorCourse(id);

  if (course === null || course.createdById !== user.id) {
    notFound();
  }

  return <CourseEditor course={course} />;
}

export default function EditCoursePage(props: EditCoursePageProps) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <EditCourseContent params={props.params} />
      </Suspense>
    </main>
  );
}
