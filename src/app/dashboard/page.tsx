import { ArrowRight, Check, Clock, Sparkles, Trophy } from "lucide-react";
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
import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import {
  flattenLessons,
  listEnrolledCourses,
  listLessonProgress,
  listPublishedCourses,
  totalMinutes,
  type LessonProgressRecord,
} from "@/lib/courses";
import { loadLearnerProfile } from "@/lib/profile";
import { recommendCourse } from "@/lib/recommendations";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("dashboard.meta.title") };
}

/**
 * Learner dashboard: one card per enrollment with overall completion and a
 * "Continue" shortcut to the first unfinished lesson (the last one once the
 * course is complete, so a finished course can still be reviewed).
 */
/** Dictionary key for the "where you left off" line on each dashboard card. */
function nextLessonLabelKey(
  completedAt: Date | null,
  progress: LessonProgressRecord | undefined,
): string {
  if (completedAt !== null) {
    return "dashboard.card.next.revisit";
  }
  if ((progress?.completedBlocks.length ?? 0) > 0) {
    return "dashboard.card.next.upNext";
  }
  return "dashboard.card.next.starts";
}

async function DashboardContent() {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const [session, { t }] = await Promise.all([auth(), getI18n()]);
  const user = session?.user;
  if (!user) {
    redirect("/login");
  }

  const [profile, publishedCourses] = await Promise.all([
    loadLearnerProfile(user.id),
    listPublishedCourses(),
  ]);

  // A learner who skipped the questionnaire is sent back to it; instructors and
  // admins use the dashboard without a profile.
  if (user.role === "LEARNER" && profile === null) {
    redirect("/onboarding");
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
  const recommendation = recommendCourse(publishedCourses, profile, t);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {t("dashboard.title", { name: user.name ?? "" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.subtitle")}
        </p>
      </header>

      {recommendation === null ? null : (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {t("dashboard.recommend.label")}
            </CardDescription>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden="true" className="text-2xl">
                {recommendation.course.coverEmoji}
              </span>
              {recommendation.course.title}
            </CardTitle>
            <CardDescription>{recommendation.reason}</CardDescription>
          </CardHeader>

          <CardContent>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {recommendation.course.description}
            </p>
          </CardContent>

          <CardFooter className="flex-wrap items-center gap-3">
            <Link
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              href={`/courses/${recommendation.course.slug}`}
            >
              {t("dashboard.recommend.open")}
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              className="text-xs text-muted-foreground hover:text-foreground"
              href="/onboarding"
            >
              {t("dashboard.recommend.updateProfile")}
            </Link>
          </CardFooter>
        </Card>
      )}

      {enrollments.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("dashboard.empty")}
            </p>
            <Link className={buttonVariants()} href="/courses">
              {t("dashboard.browse")}
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

            // Soft takedown keeps enrolments, but an archived course has no
            // public page left: linking there would dead-end on a 404.
            const coursePageHref =
              course.source === "LEARNER"
                ? "/generate"
                : course.status === "PUBLISHED"
                  ? `/courses/${course.slug}`
                  : null;

            return (
              <Card className="h-full" key={course.id}>
                <CardHeader>
                  <span aria-hidden="true" className="text-3xl">
                    {course.coverEmoji}
                  </span>
                  <CardTitle>{course.title}</CardTitle>
                  {course.source === "LEARNER" || course.status === "ARCHIVED" ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {course.source === "LEARNER" ? (
                        <Badge variant="outline">
                          {t("dashboard.card.generatedByYou")}
                        </Badge>
                      ) : null}
                      {course.status === "ARCHIVED" ? (
                        <Badge variant="destructive">
                          {t("dashboard.card.archived")}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                  <CardDescription className="line-clamp-2">
                    {course.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <Progress
                    aria-label={t("dashboard.card.progress", { title: course.title })}
                    className="items-center gap-2"
                    value={ratio}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(ratio)}%
                    </span>
                  </Progress>

                  <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {t("dashboard.card.lessons", {
                        completed: completedCount,
                        total: lessons.length,
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock aria-hidden="true" className="size-3.5" />
                      {t("dashboard.card.minutes", { count: totalMinutes(course) })}
                    </span>
                    {completedAt === null ? null : (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <Trophy aria-hidden="true" className="size-3.5" />
                        {t("dashboard.card.completed")}
                      </span>
                    )}
                  </p>

                  {nextLesson === undefined ? null : (
                    <p className="text-xs text-muted-foreground">
                      {t(nextLessonLabelKey(completedAt, nextLessonProgress))}{" "}
                      <span className="text-foreground">{nextLesson.title}</span>
                    </p>
                  )}
                </CardContent>

                <CardFooter className="mt-auto justify-between gap-2">
                  {nextLesson === undefined ? (
                    <Badge variant="secondary">{t("dashboard.card.noLessons")}</Badge>
                  ) : (
                    <Link
                      className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                      href={`/learn/${course.id}/${nextLesson.id}`}
                    >
                      {completedAt === null
                        ? t("dashboard.card.continue")
                        : t("dashboard.card.review")}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  )}
                  {coursePageHref === null ? null : (
                    <Link
                      className="text-xs text-muted-foreground hover:text-foreground"
                      href={coursePageHref}
                    >
                      {course.source === "LEARNER"
                        ? t("dashboard.card.generatedCourses")
                        : t("dashboard.card.coursePage")}
                    </Link>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.more.title")}</CardTitle>
          <CardDescription>{t("dashboard.more.description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")} href="/courses">
            <Check aria-hidden="true" className="text-emerald-600" />
            {t("dashboard.more.browse")}
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
