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
import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { completionPercent } from "@/lib/students";
import { loadCourseInsights } from "@/lib/insights";
import { EDITOR_STATUS_KEYS } from "@/lib/teach-editor";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("insights.metaTitle") };
}

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

  const [session, { locale, t }] = await Promise.all([auth(), getI18n()]);
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
  const dateTimeFormat = new Intl.DateTimeFormat(
    locale === "zh" ? "zh-CN" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );

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
        : dateTimeFormat.format(student.lastActiveAt),
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
        {t("students.page.back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-3xl">
            {course.coverEmoji}
          </span>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {t("insights.eyebrow")}
            </p>
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={isPublished ? "default" : "secondary"}>
                {t(EDITOR_STATUS_KEYS[course.status])}
              </Badge>
              <span>
                {t("insights.students", { count: insights.totalStudents })}
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
            {t("teach.students")}
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            href={`/teach/courses/${course.id}/edit`}
          >
            <Pencil aria-hidden="true" />
            {t("teach.edit")}
          </Link>
        </div>
      </header>

      <section
        aria-label={t("insights.keyNumbers")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          hint={t("insights.enrolledHint", {
            count: insights.activeLast7Days,
          })}
          icon={Users}
          label={t("insights.enrolled")}
          value={String(insights.totalStudents)}
        />
        <StatCard
          hint={t("insights.activeHint")}
          icon={Activity}
          label={t("insights.active")}
          value={String(insights.activeLast7Days)}
        />
        <StatCard
          hint={t("insights.completionHint", {
            count: insights.totalBlocksCompleted,
          })}
          icon={Gauge}
          label={t("insights.averageCompletion")}
          value={`${insights.averageCompletion}%`}
        />
        <StatCard
          hint={t("insights.quizHint")}
          icon={Trophy}
          label={t("insights.quizAverage")}
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
          <p className="mt-4 text-sm font-medium">{t("insights.empty.title")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t("insights.empty.hint")}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              className={buttonVariants()}
              href={`/teach/courses/${course.id}/students`}
            >
              {t("insights.empty.import")}
            </Link>
            {isPublished ? (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={`/courses/${course.slug}`}
              >
                {t("teach.viewPublic")}
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
                  {t("insights.daily.title")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("insights.daily.range")}
                </p>
              </div>
              <div className="mt-3">
                <ActivityLineChart
                  data={insights.dailyActivity}
                  seriesLabel={t("insights.daily.series")}
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
                  {t("insights.mix.title")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("insights.mix.completions", {
                    count: insights.totalBlocksCompleted,
                  })}
                </p>
              </div>

              {insights.blockMix.length === 0 ? (
                <p className="mt-8 text-center text-xs text-muted-foreground">
                  {t("insights.mix.empty")}
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
                {t("insights.lessons.title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("insights.lessons.hint", {
                  count: insights.totalStudents,
                })}
              </p>
            </div>

            {insights.lessonCompletion.length === 0 ? (
              <p className="mt-8 text-center text-xs text-muted-foreground">
                {t("insights.lessons.empty")}
              </p>
            ) : (
              <div className="mt-3">
                <LessonCompletionChart
                  data={insights.lessonCompletion}
                  seriesLabel={t("insights.lessons.series")}
                />
              </div>
            )}
          </section>

          <section aria-labelledby="students-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium" id="students-heading">
                {t("insights.breakdown.title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("insights.breakdown.hint")}
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
