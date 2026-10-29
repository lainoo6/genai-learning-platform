import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  PartyPopper,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { CourseDetail } from "@/components/courses/course-detail";
import { ExploreSourceButton } from "@/components/learn/explore-source-button";
import {
  LessonOutline,
  type OutlineModule,
} from "@/components/learn/lesson-outline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TutorPanel } from "@/components/tutor/TutorPanel";
import { getI18n } from "@/i18n/server";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { applyBlockOverrides } from "@/lib/blocks/override";
import { blockListSchema } from "@/lib/blocks/schema";
import {
  flattenLessons,
  getCourseById,
  listLessonProgress,
  type CourseLesson,
  type LessonProgressRecord,
} from "@/lib/courses";
import { isMockMode } from "@/lib/llm/provider";
import { prisma } from "@/lib/prisma";
import { loadTutorHistory } from "@/lib/tutor";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("lesson.metaTitle") };
}

type LessonPageProps = {
  params: Promise<{ courseId: string; lessonId: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
};

function isPreviewRequested(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

/**
 * Lesson player.
 *
 * Server-rendered so the stored progress comes straight from the database: a
 * refresh never loses anything, and each block component only owns the local
 * interaction state for one attempt.
 */
async function LessonPlayer({ params, searchParams }: LessonPageProps) {
  await connection();
  const { courseId, lessonId } = await params;
  const { preview } = await searchParams;

  const [session, { t }] = await Promise.all([auth(), getI18n()]);
  const userId = session?.user?.id;
  if (userId === undefined) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/learn/${courseId}/${lessonId}${isPreviewRequested(preview) ? "?preview=1" : ""}`)}`,
    );
  }

  const role = session?.user?.role;
  const canPreview =
    isPreviewRequested(preview) &&
    (role === "INSTRUCTOR" || role === "ADMIN");

  const course = await getCourseById(courseId);
  if (course === null) {
    notFound();
  }

  // Learner-generated courses are private to their author (P4.7): guessing the
  // id of somebody else's mini-course must not reveal even its outline.
  if (course.source === "LEARNER" && course.createdById !== userId) {
    notFound();
  }

  // A preview of an unpublished draft is only for its author (or an admin).
  if (
    canPreview &&
    course.status !== "PUBLISHED" &&
    role !== "ADMIN" &&
    course.createdById !== userId
  ) {
    notFound();
  }

  const lessons = flattenLessons(course);
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  if (lesson === undefined) {
    notFound();
  }

  // Preview never enrolls the teacher, so there is intentionally no enrollment
  // lookup in this branch.
  const enrollment = canPreview
    ? null
    : await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { completedAt: true },
      });

  // Not enrolled yet: show the same course page with a prompt instead of the
  // lesson, so a shared player URL never dead-ends.
  if (!canPreview && enrollment === null) {
    return (
      <CourseDetail
        course={course}
        enrolled={false}
        firstLessonHref={null}
        notice={t("course.notice.notEnrolled")}
      />
    );
  }

  // Preview shows the course from a clean slate: no existing learner progress
  // leaks into what the teacher sees.
  const progress = canPreview
    ? new Map<string, LessonProgressRecord>()
    : await listLessonProgress(
        userId,
        lessons.map((entry) => entry.id),
      );

  const lessonRow = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { blocks: true },
  });

  // Per-learner rewrites (P4.4) are merged in at read time, so the stored lesson
  // payload stays exactly as the author wrote it for everybody else. Preview
  // always renders the canonical lesson.
  const overrideRows = canPreview
    ? []
    : await prisma.userBlockOverride.findMany({
        where: { userId, lessonId },
        select: { blockId: true, markdown: true },
      });
  const overriddenBlockIds = new Set(overrideRows.map((row) => row.blockId));

  const parsedBlocks = blockListSchema.safeParse(lessonRow?.blocks);
  const blocks = applyBlockOverrides(
    parsedBlocks.success ? parsedBlocks.data : [],
    overrideRows,
  );

  // Preview is invisible to analytics: otherwise every teacher preview would
  // look like a learner starting the lesson.
  if (!canPreview) {
    await trackEvent("LESSON_START", {
      userId,
      courseId,
      payload: { lessonId, lessonTitle: lesson.title },
    });
  }

  const modules: OutlineModule[] = course.modules.map((courseModule) => ({
    id: courseModule.id,
    title: courseModule.title,
    lessons: courseModule.lessons.map((entry) => ({
      id: entry.id,
      title: entry.title,
      blockTypes: entry.blockTypes,
      minutes: entry.estimatedMinutes,
      completed: progress.get(entry.id)?.status === "COMPLETED",
    })),
  }));

  const index = lessons.findIndex((entry) => entry.id === lessonId);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];

  const completedBlocks = progress.get(lessonId)?.completedBlocks ?? [];
  const allBlocksDone =
    blocks.length > 0 && blocks.every((block) => completedBlocks.includes(block.id));
  const courseCompleted =
    !canPreview &&
    (enrollment?.completedAt != null ||
      lessons.every((entry) => progress.get(entry.id)?.status === "COMPLETED"));

  const lessonRatio =
    blocks.length === 0 ? 0 : (completedBlocks.length / blocks.length) * 100;

  // Conversation shown when the tutor drawer opens (P4.3): the last messages of
  // this lesson's session, or an empty list until the learner asks something.
  // The tutor is hidden during preview, so no history is read.
  const tutorMessages = canPreview
    ? []
    : await loadTutorHistory(userId, courseId, lessonId);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <LessonOutline
        courseId={courseId}
        currentLessonId={lessonId}
        modules={modules}
        preview={canPreview}
      />

      <div className="space-y-6">
        <nav
          aria-label={t("lesson.breadcrumb")}
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          <Link className="hover:text-foreground" href="/courses">
            {t("nav.courses")}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3" />
          {course.source === "LEARNER" || course.status !== "PUBLISHED" ? (
            // Generated courses and unpublished drafts have no public page;
            // showing a link here would dead-end on the catalog's 404.
            <span className="text-foreground">{course.title}</span>
          ) : (
            <Link className="hover:text-foreground" href={`/courses/${course.slug}`}>
              {course.title}
            </Link>
          )}
          <ChevronRight aria-hidden="true" className="size-3" />
          <span className="text-foreground">{lesson.title}</span>
        </nav>

        {canPreview ? (
          <p
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm"
            role="status"
          >
            {t("lesson.preview.notice")}
          </p>
        ) : null}

        <header className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("lesson.position", {
              module: lesson.moduleTitle,
              current: index + 1,
              total: lessons.length,
            })}
          </p>
          <h1 className="text-2xl font-semibold">{lesson.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              {t("lesson.minutes", { count: lesson.estimatedMinutes })}
            </Badge>
            <Badge variant="outline">
              {t("lesson.blocks", {
                completed: completedBlocks.length,
                total: blocks.length,
              })}
            </Badge>
            {course.repoUrl !== null ? (
              <ExploreSourceButton
                branch={course.repoBranch}
                courseId={courseId}
                filePaths={course.repoSelectedPaths}
                repoUrl={course.repoUrl}
              />
            ) : null}
          </div>
          <Progress
            aria-label={t("lesson.progress")}
            className="items-center gap-2"
            value={lessonRatio}
          >
            <ProgressValue />
          </Progress>
        </header>

        {parsedBlocks.success ? null : (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t("lesson.schemaError")}
          </p>
        )}

        <div className="space-y-4">
          {blocks.map((block) => (
            <BlockRenderer
              block={block}
              completed={completedBlocks.includes(block.id)}
              courseId={courseId}
              key={block.id}
              lessonId={lessonId}
              overridden={overriddenBlockIds.has(block.id)}
              preview={canPreview}
            />
          ))}
        </div>

        {allBlocksDone ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
            <p className="font-medium">{t("lesson.complete.title")}</p>
            <p className="mt-1 text-muted-foreground">
              {next === undefined
                ? courseCompleted
                  ? t("lesson.complete.allDone")
                  : t("lesson.complete.last")
                : t("lesson.complete.next")}
            </p>
          </div>
        ) : null}

        {courseCompleted ? (
          <div className="rounded-xl ring-1 ring-primary/30 bg-primary/5 px-4 py-4">
            <p className="flex items-center gap-2 font-medium">
              <PartyPopper aria-hidden="true" className="size-4" />
              {t("lesson.courseComplete.title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("lesson.courseComplete.body", { title: course.title })}
            </p>
            <Link
              className={cn(buttonVariants({ variant: "secondary" }), "mt-3")}
              href="/dashboard"
            >
              {t("lesson.backToDashboard")}
            </Link>
          </div>
        ) : null}

        <nav
          aria-label={t("lesson.nav")}
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        >
          {previous === undefined ? (
            <span />
          ) : (
            <NavLink
              courseId={courseId}
              direction="previous"
              lesson={previous}
              preview={canPreview}
            />
          )}
          {next === undefined ? (
            <Link
              className={cn(buttonVariants({ variant: "secondary" }), "ml-auto")}
              href="/dashboard"
            >
              {t("lesson.backToDashboard")}
            </Link>
          ) : (
            <NavLink
              courseId={courseId}
              direction="next"
              lesson={next}
              preview={canPreview}
            />
          )}
        </nav>
      </div>

      {canPreview ? null : (
        <TutorPanel
          courseId={courseId}
          initialMessages={tutorMessages}
          lessonId={lessonId}
          lessonTitle={lesson.title}
          mockMode={isMockMode()}
        />
      )}
    </div>
  );
}

function NavLink({
  courseId,
  direction,
  lesson,
  preview,
}: {
  courseId: string;
  direction: "previous" | "next";
  lesson: CourseLesson;
  preview: boolean;
}) {
  const isPrevious = direction === "previous";
  const Icon = isPrevious ? ArrowLeft : ArrowRight;

  const link = (
    <>
      {isPrevious ? <Icon aria-hidden="true" /> : null}
      <span className="max-w-56 truncate">{lesson.title}</span>
      {isPrevious ? null : <Icon aria-hidden="true" />}
    </>
  );

  const className = cn(
    buttonVariants({ variant: "outline" }),
    "gap-2",
    isPrevious ? "" : "ml-auto",
  );

  return (
    <Link
      className={className}
      href={`/learn/${courseId}/${lesson.id}${preview ? "?preview=1" : ""}`}
    >
      {link}
    </Link>
  );
}

export default function LessonPage(props: LessonPageProps) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <LessonPlayer params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
