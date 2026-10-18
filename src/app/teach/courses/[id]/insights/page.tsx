import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarCheck,
  Gauge,
  Pencil,
  Trophy,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ActivityLineChart } from "@/components/charts/activity-line-chart";
import { BlockMixChart } from "@/components/teach/insights/block-mix-chart";
import { LessonCompletionChart } from "@/components/teach/insights/lesson-completion-chart";
import {
  StudentInsightsTable,
  type StudentInsightRow,
} from "@/components/teach/insights/student-insights-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { completionPercent } from "@/lib/students";
import { loadCourseInsights } from "@/lib/insights";
import { COURSE_STATUS_LABELS } from "@/lib/teach";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Insights",
};

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type InsightsPageProps = {
  params: Promise<{ id: string }>;
};

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl px-4 py-4 ring-1 ring-foreground/10">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Decorative empty state; drawn inline so it follows the page's spacing. */
function EmptyInsightsIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto h-24 w-40"
      viewBox="0 0 160 96"
    >
      <rect fill="#f3f4f6" height="72" rx="10" width="144" x="8" y="10" />
      <line
        stroke="#d1d5db"
        strokeDasharray="4 4"
        strokeWidth="1.5"
        x1="22"
        x2="138"
        y1="66"
        y2="66"
      />
      <rect fill="#dbeafe" height="18" rx="3" width="13" x="30" y="48" />
      <rect fill="#bfdbfe" height="30" rx="3" width="13" x="52" y="36" />
      <rect fill="#93c5fd" height="12" rx="3" width="13" x="74" y="54" />
      <rect fill="#e5e7eb" height="40" rx="3" width="13" x="96" y="26" />
      <circle cx="102.5" cy="70" fill="none" r="14" stroke="#cbd5e1" strokeWidth="3" />
      <path
        d="M112 80 L124 92"
        stroke="#cbd5e1"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}

/**
 * Course engagement dashboard (P5.3).
 *
 * Guard and ownership follow the editor and roster: a teacher who guesses a
 * course id gets a 404. Every number is computed in `loadCourseInsights` from
 * EngagementEvent and LessonProgress, so the charts cannot disagree with the
 * roster page or the CSV export.
 */
async function InsightsContent({ params }: InsightsPageProps) {
  // Auth.js draws random bytes; keep it out of the prerender pass.
  await connection();
  const { id } = await params;

  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/teach/courses/${id}/insights`)}`,
    );
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    redirect("/");
  }

  const insights = await loadCourseInsights(id);

  if (insights === null || insights.course.createdById !== user.id) {
    notFound();
  }

  const { course, students } = insights;
  const isPublished = course.status === "PUBLISHED";

  const rows: StudentInsightRow[] = students.map((student) => ({
    userId: student.userId,
    name: student.name,
    email: student.email,
    completedLessons: student.completedLessons,
    totalLessons: student.totalLessons,
    completionPercent: completionPercent(student),
    quizAverageLabel:
      student.quizAverage === null
        ? "—"
        : `${Math.round(student.quizAverage * 100)}%`,
    blocksCompleted: student.blocksCompleted,
    lastActiveLabel:
      student.lastActiveAt === null
        ? "—"
        : DATE_TIME_FORMAT.format(student.lastActiveAt),
    lessons: student.lessons.map((lesson) => ({
      lessonId: lesson.lessonId,
      title: lesson.title,
      moduleTitle: lesson.moduleTitle,
      status: lesson.status,
      scoreLabel:
        lesson.score === null ? "—" : `${Math.round(lesson.score * 100)}%`,
      completedBlocks: lesson.completedBlocks,
      totalBlocks: lesson.totalBlocks,
    })),
  }));

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
              Insights
            </p>
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={isPublished ? "default" : "secondary"}>
                {COURSE_STATUS_LABELS[course.status]}
              </Badge>
              <span>
                {insights.totalStudents} student
                {insights.totalStudents === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            href={`/teach/courses/${course.id}/students`}
          >
            <Users aria-hidden="true" />
            Students
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            href={`/teach/courses/${course.id}/edit`}
          >
            <Pencil aria-hidden="true" />
            Edit course
          </Link>
        </div>
      </header>

      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          hint={`${insights.activeLast7Days} active in the last 7 days`}
          icon={Users}
          label="Enrolled"
          value={String(insights.totalStudents)}
        />
        <StatCard
          hint="Distinct learners with any activity"
          icon={Activity}
          label="Active (7 days)"
          value={String(insights.activeLast7Days)}
        />
        <StatCard
          hint={`${insights.totalBlocksCompleted} blocks completed in total`}
          icon={Gauge}
          label="Average completion"
          value={`${insights.averageCompletion}%`}
        />
        <StatCard
          hint="Mean of each learner's lesson scores"
          icon={Trophy}
          label="Quiz average"
          value={
            insights.quizAverage === null
              ? "—"
              : `${Math.round(insights.quizAverage * 100)}%`
          }
        />
      </section>

      {insights.totalStudents === 0 ? (
        <section className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <EmptyInsightsIllustration />
          <p className="mt-4 text-sm font-medium">No learners yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Charts fill in as soon as somebody starts this course. Import a
            roster to give your class an account, or share the course page.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              className={buttonVariants()}
              href={`/teach/courses/${course.id}/students`}
            >
              Import students
            </Link>
            {isPublished ? (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/courses/${course.slug}`}
              >
                View public page
              </Link>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl px-4 py-4 ring-1 ring-foreground/10 lg:col-span-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarCheck
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  Daily active learners
                </h2>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </div>
              <div className="mt-3">
                <ActivityLineChart
                  data={insights.dailyActivity}
                  seriesLabel="Active learners"
                />
              </div>
            </div>

            <div className="rounded-xl px-4 py-4 ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-medium">
                  <BarChart3
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  Activity mix
                </h2>
                <p className="text-xs text-muted-foreground">
                  {insights.totalBlocksCompleted} completions
                </p>
              </div>

              {insights.blockMix.length === 0 ? (
                <p className="mt-8 text-center text-xs text-muted-foreground">
                  No blocks completed yet.
                </p>
              ) : (
                <div className="mt-3">
                  <BlockMixChart data={insights.blockMix} />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl px-4 py-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <BarChart3
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                Lesson completions
              </h2>
              <p className="text-xs text-muted-foreground">
                Completed by how many of {insights.totalStudents} learners
              </p>
            </div>

            {insights.lessonCompletion.length === 0 ? (
              <p className="mt-8 text-center text-xs text-muted-foreground">
                This course has no lessons yet.
              </p>
            ) : (
              <div className="mt-3">
                <LessonCompletionChart
                  data={insights.lessonCompletion}
                  seriesLabel="Learners who completed"
                />
              </div>
            )}
          </section>

          <section aria-labelledby="students-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium" id="students-heading">
                Student breakdown
              </h2>
              <p className="text-xs text-muted-foreground">
                Select a name to see every lesson
              </p>
            </div>

            <StudentInsightsTable students={rows} />
          </section>
        </>
      )}
    </div>
  );
}

export default function InsightsPage(props: InsightsPageProps) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        }
      >
        <InsightsContent params={props.params} />
      </Suspense>
    </main>
  );
}
