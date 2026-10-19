import { GraduationCap, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getI18n } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { listTaughtCourses } from "@/lib/teach";
import { EDITOR_STATUS_KEYS } from "@/lib/teach-editor";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("teach.metaTitle") };
}

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
  const [session, { locale, t }] = await Promise.all([auth(), getI18n()]);
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
  const dateFormat = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
            <GraduationCap aria-hidden="true" className="size-3.5" />
            {t("teach.eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold">{t("teach.title")}</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("teach.subtitle")}
          </p>
        </div>

        <Link
          className={cn(buttonVariants(), "gap-1.5")}
          href="/teach/courses/new"
        >
          <Sparkles aria-hidden="true" />
          {t("teach.newCourse")}
        </Link>
      </header>

      {created.length === 0 ? null : (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <span className="font-medium">
            {t("teach.saved", { title: created })}
          </span>{" "}
          <span className="text-muted-foreground">{t("teach.savedHint")}</span>
        </p>
      )}

      <section aria-labelledby="courses-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium" id="courses-heading">
            {t("teach.authored")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("teach.count", { count: courses.length })}
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="rounded-xl px-4 py-10 text-center ring-1 ring-foreground/10">
            <p className="text-sm font-medium">{t("teach.empty")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t("teach.emptyHint")}
            </p>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "mt-4 gap-1.5")}
              href="/teach/courses/new"
            >
              <Sparkles aria-hidden="true" />
              {t("teach.emptyCta")}
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
                          {t(EDITOR_STATUS_KEYS[course.status])}
                        </Badge>
                        <Badge variant="outline">
                          {course.source === "AI_GENERATED"
                            ? t("teach.badge.ai")
                            : t("teach.badge.authored")}
                        </Badge>
                      </div>

                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {course.description}
                      </p>

                      <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {t("editor.course.modulesCount", {
                            count: course.moduleCount,
                          })}
                        </span>
                        <span>
                          {t("editor.course.lessonsCount", {
                            count: course.lessonCount,
                          })}
                        </span>
                        <span>{course.difficulty}</span>
                        <span>
                          {t("teach.updated", {
                            date: dateFormat.format(course.updatedAt),
                          })}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          className="text-xs font-medium text-primary hover:underline"
                          href={`/teach/courses/${course.id}/edit`}
                        >
                          {t("teach.edit")}
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
                          {t("teach.students")}
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
                          {t("teach.insights")}
                        </Link>
                      </div>
                      {isPublished ? (
                        <Link
                          className="text-xs text-muted-foreground hover:underline"
                          href={`/courses/${course.slug}`}
                        >
                          {t("teach.viewPublic")}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("teach.notPublic")}
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
