import { ArrowRight, Check, Clock, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import {
  flattenLessons,
  listEnrolledCourses,
  listLessonProgress,
  totalMinutes,
  type LessonProgressRecord,
} from "@/lib/courses";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Learner dashboard: one card per enrollment with overall completion and a
 * "Continue" shortcut to the first unfinished lesson (the last one once the
 * course is complete, so a finished course can still be reviewed).
 */
/** Label for the "where you left off" line on each dashboard card. */
function nextLessonLabel(
  completedAt: Date | null,
  progress: LessonProgressRecord | undefined,
): string {
  if (completedAt !== null) {
    return "Revisit:";
  }
  if ((progress?.completedBlocks.length ?? 0) > 0) {
    return "Up next:";
  }
  return "Starts with:";
}

async function DashboardContent() {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect("/login");
  }

  const enrollments = await listEnrolledCourses(user.id);
  const progressByCourse = await Promise.all(
    enrollments.map(async ({ course }) => [
      course.id,
      await listLessonProgress(
        user.id,
        flattenLessons(course).map((lesson) => lesson.id),
      ),
    ] as const),
  );
  const progress = new Map(progressByCourse);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Welcome back, {user.name}</h1>
        <p className="text-sm text-muted-foreground">
          Pick up where you left off, or browse the catalog for something new.
        </p>
      </header>

      {enrollments.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You have not enrolled in a course yet.
            </p>
            <Link className={buttonVariants()} href="/courses">
              Browse courses
              <ArrowRight aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {enrollments.map(({ course, completedAt }) => {
            const lessons = flattenLessons(course);
            const courseProgress = progress.get(course.id);
            const completedCount = lessons.filter(
              (lesson) => courseProgress?.get(lesson.id)?.status === "COMPLETED",
            ).length;

            const inProgressLesson = lessons.find(
              (lesson) =>
                (courseProgress?.get(lesson.id)?.completedBlocks.length ?? 0) > 0
                && courseProgress?.get(lesson.id)?.status !== "COMPLETED",
            );
            const nextLesson =
              inProgressLesson
              ?? lessons.find(
                (lesson) =>
                  courseProgress?.get(lesson.id)?.status !== "COMPLETED",
              )
              ?? lessons[lessons.length - 1];

            const nextLessonProgress =
              nextLesson === undefined
                ? undefined
                : courseProgress?.get(nextLesson.id);
            const ratio =
              lessons.length === 0 ? 0 : (completedCount / lessons.length) * 100;

            return (
              <Card className="h-full" key={course.id}>
                <CardHeader>
                  <span aria-hidden="true" className="text-3xl">
                    {course.coverEmoji}
                  </span>
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {course.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <Progress
                    aria-label={`${course.title} progress`}
                    className="items-center gap-2"
                    value={ratio}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(ratio)}%
                    </span>
                  </Progress>

                  <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {completedCount} / {lessons.length} lessons
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock aria-hidden="true" className="size-3.5" />~
                      {totalMinutes(course)} min
                    </span>
                    {completedAt === null ? null : (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <Trophy aria-hidden="true" className="size-3.5" />
                        Completed
                      </span>
                    )}
                  </p>

                  {nextLesson === undefined ? null : (
                    <p className="text-xs text-muted-foreground">
                      {nextLessonLabel(completedAt, nextLessonProgress)}{" "}
                      <span className="text-foreground">{nextLesson.title}</span>
                    </p>
                  )}
                </CardContent>

                <CardFooter className="mt-auto justify-between gap-2">
                  {nextLesson === undefined ? (
                    <Badge variant="secondary">No lessons yet</Badge>
                  ) : (
                    <Link
                      className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                      href={`/learn/${course.id}/${nextLesson.id}`}
                    >
                      {completedAt === null ? "Continue" : "Review"}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  )}
                  <Link
                    className="text-xs text-muted-foreground hover:text-foreground"
                    href={`/courses/${course.slug}`}
                  >
                    Course page
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Looking for something else?</CardTitle>
          <CardDescription>
            The catalog lists every published mini-course, including the ones you
            have not started.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")} href="/courses">
            <Check aria-hidden="true" className="text-emerald-600" />
            Browse the catalog
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton className="h-56 w-full rounded-xl" key={index} />
            ))}
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </main>
  );
}
