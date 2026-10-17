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
import {
  LessonOutline,
  type OutlineModule,
} from "@/components/learn/lesson-outline";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TutorPanel } from "@/components/tutor/TutorPanel";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { applyBlockOverrides } from "@/lib/blocks/override";
import { blockListSchema } from "@/lib/blocks/schema";
import {
  flattenLessons,
  getCourseById,
  listLessonProgress,
  type CourseLesson,
} from "@/lib/courses";
import { isMockMode } from "@/lib/llm/provider";
import { prisma } from "@/lib/prisma";
import { loadTutorHistory } from "@/lib/tutor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Lesson",
};

type LessonPageProps = {
  params: Promise<{ courseId: string; lessonId: string }>;
};

/**
 * Lesson player.
 *
 * Server-rendered so the stored progress comes straight from the database: a
 * refresh never loses anything, and each block component only owns the local
 * interaction state for one attempt.
 */
async function LessonPlayer({ params }: LessonPageProps) {
  await connection();
  const { courseId, lessonId } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/learn/${courseId}/${lessonId}`)}`,
    );
  }

  const course = await getCourseById(courseId);
  if (course === null) {
    notFound();
  }

  const lessons = flattenLessons(course);
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  if (lesson === undefined) {
    notFound();
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { completedAt: true },
  });

  // Not enrolled yet: show the same course page with a prompt instead of the
  // lesson, so a shared player URL never dead-ends.
  if (enrollment === null) {
    return (
      <CourseDetail
        course={course}
        enrolled={false}
        firstLessonHref={null}
        notice="Enroll in this course to open its lessons."
      />
    );
  }

  const progress = await listLessonProgress(
    userId,
    lessons.map((entry) => entry.id),
  );

  const lessonRow = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { blocks: true },
  });

  // Per-learner rewrites (P4.4) are merged in at read time, so the stored lesson
  // payload stays exactly as the author wrote it for everybody else.
  const overrideRows = await prisma.userBlockOverride.findMany({
    where: { userId, lessonId },
    select: { blockId: true, markdown: true },
  });
  const overriddenBlockIds = new Set(overrideRows.map((row) => row.blockId));

  const parsedBlocks = blockListSchema.safeParse(lessonRow?.blocks);
  const blocks = applyBlockOverrides(
    parsedBlocks.success ? parsedBlocks.data : [],
    overrideRows,
  );

  await trackEvent("LESSON_START", {
    userId,
    courseId,
    payload: { lessonId, lessonTitle: lesson.title },
  });

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
    enrollment.completedAt !== null
    || lessons.every((entry) => progress.get(entry.id)?.status === "COMPLETED");

  const lessonRatio =
    blocks.length === 0 ? 0 : (completedBlocks.length / blocks.length) * 100;

  // Conversation shown when the tutor drawer opens (P4.3): the last messages of
  // this lesson's session, or an empty list until the learner asks something.
  const tutorMessages = await loadTutorHistory(userId, courseId, lessonId);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <LessonOutline
        courseId={courseId}
        currentLessonId={lessonId}
        modules={modules}
      />

      <div className="space-y-6">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          <Link className="hover:text-foreground" href="/courses">
            Courses
          </Link>
          <ChevronRight aria-hidden="true" className="size-3" />
          <Link className="hover:text-foreground" href={`/courses/${course.slug}`}>
            {course.title}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3" />
          <span className="text-foreground">{lesson.title}</span>
        </nav>

        <header className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {lesson.moduleTitle} · lesson {index + 1} of {lessons.length}
          </p>
          <h1 className="text-2xl font-semibold">{lesson.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{lesson.estimatedMinutes} min</Badge>
            <Badge variant="outline">
              {completedBlocks.length} / {blocks.length} blocks
            </Badge>
          </div>
          <Progress
            aria-label="Lesson progress"
            className="items-center gap-2"
            value={lessonRatio}
          >
            <ProgressValue />
          </Progress>
        </header>

        {parsedBlocks.success ? null : (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            This lesson contains content that does not match the block schema, so
            nothing can be rendered yet. Ask the course author to fix the block
            payload.
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
            />
          ))}
        </div>

        {allBlocksDone ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
            <p className="font-medium">Lesson complete 🎉</p>
            <p className="mt-1 text-muted-foreground">
              {next === undefined
                ? courseCompleted
                  ? "You finished every lesson in this course."
                  : "This was the last lesson of the course."
                : "Next lesson is unlocked — keep going."}
            </p>
          </div>
        ) : null}

        {courseCompleted ? (
          <div className="rounded-xl ring-1 ring-primary/30 bg-primary/5 px-4 py-4">
            <p className="flex items-center gap-2 font-medium">
              <PartyPopper aria-hidden="true" className="size-4" />
              Course complete
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You completed {course.title}. This course is now marked as finished
              on your dashboard.
            </p>
            <Link
              className={cn(buttonVariants({ variant: "secondary" }), "mt-3")}
              href="/dashboard"
            >
              Back to dashboard
            </Link>
          </div>
        ) : null}

        <nav
          aria-label="Lesson navigation"
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        >
          {previous === undefined ? (
            <span />
          ) : (
            <NavLink direction="previous" lesson={previous} courseId={courseId} />
          )}
          {next === undefined ? (
            <Link
              className={cn(buttonVariants({ variant: "secondary" }), "ml-auto")}
              href="/dashboard"
            >
              Back to dashboard
            </Link>
          ) : (
            <NavLink direction="next" lesson={next} courseId={courseId} />
          )}
        </nav>
      </div>

      <TutorPanel
        courseId={courseId}
        initialMessages={tutorMessages}
        lessonId={lessonId}
        lessonTitle={lesson.title}
        mockMode={isMockMode()}
      />
    </div>
  );
}

function NavLink({
  courseId,
  direction,
  lesson,
}: {
  courseId: string;
  direction: "previous" | "next";
  lesson: CourseLesson;
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
    <Link className={className} href={`/learn/${courseId}/${lesson.id}`}>
      {link}
    </Link>
  );
}

export default function LessonPage(props: LessonPageProps) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <LessonPlayer params={props.params} />
      </Suspense>
    </main>
  );
}
