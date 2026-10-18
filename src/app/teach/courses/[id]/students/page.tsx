import { ArrowLeft, Pencil, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { StudentImportPanel } from "@/components/teach/students/student-import-panel";
import { StudentRoster } from "@/components/teach/students/student-roster";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { listCourseStudents, loadRosterCourse } from "@/lib/students";
import { COURSE_STATUS_LABELS } from "@/lib/teach";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Students",
};

type StudentsPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Instructor roster for one course (P5.2).
 *
 * Ownership is the guard, exactly as in the course editor: a teacher who
 * guesses another teacher's course id gets a 404. The export link points at the
 * streaming route handler (P5.5), which repeats the same check.
 */
async function StudentsContent({ params }: StudentsPageProps) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const { id } = await params;

  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/teach/courses/${id}/students`)}`,
    );
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    redirect("/");
  }

  const course = await loadRosterCourse(id);

  if (course === null || course.createdById !== user.id) {
    notFound();
  }

  const students = await listCourseStudents(course.id);
  const isPublished = course.status === "PUBLISHED";

  return (
    <div className="space-y-8">
      <Link
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        href="/teach"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        All courses
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-3xl">
            {course.coverEmoji}
          </span>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Students
            </p>
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={isPublished ? "default" : "secondary"}>
                {COURSE_STATUS_LABELS[course.status]}
              </Badge>
              <span>
                {students.length} student{students.length === 1 ? "" : "s"}{" "}
                enrolled
              </span>
            </p>
          </div>
        </div>

        <Link
          className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
          href={`/teach/courses/${course.id}/edit`}
        >
          <Pencil aria-hidden="true" />
          Edit course
        </Link>
      </header>

      <StudentImportPanel courseId={course.id} slug={course.slug} />

      <section aria-labelledby="roster-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-medium" id="roster-heading">
              Roster
            </h2>
            <p className="text-xs text-muted-foreground">
              {students.length} student{students.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <Users aria-hidden="true" className="size-6 text-muted-foreground" />
            </span>
            <p className="mt-4 text-sm font-medium">No students yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Import a CSV with names and emails above{isPublished ? ", or share the course page so learners can enrol" : ""}.
              Progress and quiz scores appear here as they learn.
            </p>
          </div>
        ) : (
          <StudentRoster courseId={course.id} students={students} />
        )}
      </section>
    </div>
  );
}

export default function StudentsPage(props: StudentsPageProps) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        }
      >
        <StudentsContent params={props.params} />
      </Suspense>
    </main>
  );
}
