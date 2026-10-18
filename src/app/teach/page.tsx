import { GraduationCap, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { COURSE_STATUS_LABELS, listTaughtCourses } from "@/lib/teach";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Teaching",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type TeachPageProps = {
  searchParams: Promise<{ created?: string }>;
};

/**
 * Instructor home (P4.6).
 *
 * One job: show the courses this teacher owns and offer the AI wizard as the
 * way to start a new one. Ownership is `Course.createdById`, which is also what
 * the wizard's save action writes, so the list can never show somebody else's
 * draft.
 */
async function TeachContent({ searchParams }: TeachPageProps) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const user = session?.user;

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/teach")}`);
  }

  // The middleware already guards /teach; this is the server-side repeat in
  // case a route is ever reached through a different path.
  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    redirect("/");
  }

  const [courses, query] = await Promise.all([
    listTaughtCourses(user.id),
    searchParams,
  ]);
  const created = query.created?.trim() ?? "";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
            <GraduationCap aria-hidden="true" className="size-3.5" />
            Teaching
          </p>
          <h1 className="text-2xl font-semibold">My courses</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Every course you author. Generated courses start as drafts, so you
            can review the blocks before anybody can enrol.
          </p>
        </div>

        <Link
          className={cn(buttonVariants(), "gap-1.5")}
          href="/teach/courses/new"
        >
          <Sparkles aria-hidden="true" />
          New course with AI
        </Link>
      </header>

      {created.length === 0 ? null : (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <span className="font-medium">Saved “{created}” as a draft.</span>{" "}
          <span className="text-muted-foreground">
            Open its editor below to add blocks and publish it.
          </span>
        </p>
      )}

      <section aria-labelledby="courses-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium" id="courses-heading">
            Authored courses
          </h2>
          <p className="text-xs text-muted-foreground">
            {courses.length} course{courses.length === 1 ? "" : "s"}
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="rounded-xl px-4 py-10 text-center ring-1 ring-foreground/10">
            <p className="text-sm font-medium">No courses yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Describe a topic and the wizard will plan an outline and write the
              lessons, one block at a time.
            </p>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "mt-4 gap-1.5")}
              href="/teach/courses/new"
            >
              <Sparkles aria-hidden="true" />
              Start the first one
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {courses.map((course) => {
              const isPublished = course.status === "PUBLISHED";

              return (
                <li
                  className="rounded-xl px-4 py-4 ring-1 ring-foreground/10"
                  key={course.id}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span aria-hidden="true" className="text-2xl">
                      {course.coverEmoji}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium">{course.title}</h3>
                        <Badge
                          variant={isPublished ? "default" : "secondary"}
                        >
                          {COURSE_STATUS_LABELS[course.status]}
                        </Badge>
                        <Badge variant="outline">
                          {course.source === "AI_GENERATED"
                            ? "AI generated"
                            : "Authored"}
                        </Badge>
                      </div>

                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {course.description}
                      </p>

                      <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {course.moduleCount} module
                          {course.moduleCount === 1 ? "" : "s"}
                        </span>
                        <span>
                          {course.lessonCount} lesson
                          {course.lessonCount === 1 ? "" : "s"}
                        </span>
                        <span>{course.difficulty}</span>
                        <span>Updated {DATE_FORMAT.format(course.updatedAt)}</span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          className="text-xs font-medium text-primary hover:underline"
                          href={`/teach/courses/${course.id}/edit`}
                        >
                          Edit course
                        </Link>
                        <span
                          aria-hidden="true"
                          className="text-xs text-muted-foreground"
                        >
                          ·
                        </span>
                        <Link
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                          href={`/teach/courses/${course.id}/students`}
                        >
                          Students
                        </Link>
                        <span
                          aria-hidden="true"
                          className="text-xs text-muted-foreground"
                        >
                          ·
                        </span>
                        <Link
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                          href={`/teach/courses/${course.id}/insights`}
                        >
                          Insights
                        </Link>
                      </div>
                      {isPublished ? (
                        <Link
                          className="text-xs text-muted-foreground hover:underline"
                          href={`/courses/${course.slug}`}
                        >
                          View public page
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not in the catalog yet
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function TeachPage(props: TeachPageProps) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-20 w-2/3 rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        }
      >
        <TeachContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
