import { Check, ChevronLeft, Clock, Lock } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { blockMetaFor } from "@/lib/blocks/meta";
import {
  countLessons,
  DIFFICULTY_LABELS,
  SOURCE_LABELS,
  totalMinutes,
  type CourseWithLessons,
} from "@/lib/courses";
import { EnrollButton } from "./enroll-button";

/**
 * Read-only course detail view: hero + module outline + enroll action.
 *
 * It is shared by `/courses/[slug]` and by the lesson player, which renders the
 * same screen (with a notice) when somebody opens a player URL for a course
 * they have not enrolled in yet.
 */
export function CourseDetail({
  course,
  enrolled,
  firstLessonHref,
  notice = null,
}: {
  course: CourseWithLessons;
  enrolled: boolean;
  /** `/learn/<courseId>/<lessonId>` for the first lesson, or null if empty. */
  firstLessonHref: string | null;
  /** Optional callout shown above the hero (e.g. "Enroll to start learning"). */
  notice?: string | null;
}) {
  const difficultyLabel = DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty;

  return (
    <article className="space-y-8">
      <Link
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        href="/courses"
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" />
        All courses
      </Link>

      {notice === null ? null : (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span aria-hidden="true" className="text-5xl">
          {course.coverEmoji}
        </span>

        <div className="flex-1 space-y-3">
          <h1 className="text-2xl font-semibold">{course.title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {course.description}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{difficultyLabel}</Badge>
            <Badge variant="secondary">{course.audience}</Badge>
            <Badge variant="outline">{course.topic}</Badge>
            <Badge variant="outline">{SOURCE_LABELS[course.source]}</Badge>
          </div>

          <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              {course.modules.length} modules · {countLessons(course)} lessons
            </span>
            <span className="flex items-center gap-1">
              <Clock aria-hidden="true" className="size-3.5" />~
              {totalMinutes(course)} min
            </span>
            {enrolled ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check aria-hidden="true" className="size-3.5" />
                Enrolled
              </span>
            ) : null}
          </p>
        </div>

        <EnrollButton
          courseId={course.id}
          enrolled={enrolled}
          firstLessonHref={firstLessonHref}
        />
      </header>

      <hr className="border-foreground/10" />

      <section className="space-y-4">
        <h2 className="text-sm font-medium">What you will work through</h2>

        {course.modules.map((courseModule) => (
          <div className="rounded-xl ring-1 ring-foreground/10" key={courseModule.id}>
            <header className="border-b px-4 py-3">
              <h3 className="text-sm font-medium">{courseModule.title}</h3>
              <p className="text-xs text-muted-foreground">
                {courseModule.lessons.length} lessons
              </p>
            </header>

            <ol className="divide-y">
              {courseModule.lessons.map((lesson, index) => (
                <li key={lesson.id}>
                  <LessonRow
                    href={enrolled ? `/learn/${course.id}/${lesson.id}` : null}
                    title={lesson.title}
                    types={lesson.blockTypes}
                    minutes={lesson.estimatedMinutes}
                    position={index + 1}
                  />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </article>
  );
}

function LessonRow({
  href,
  minutes,
  title,
  types,
  position,
}: {
  href: string | null;
  minutes: number;
  title: string;
  types: readonly string[];
  position: number;
}) {
  const content = (
    <>
      <span className="text-xs text-muted-foreground tabular-nums">
        {position}.
      </span>
      <span className="flex-1 text-sm">{title}</span>
      <span className="flex items-center gap-2">
        {types.map((type) => {
          const { icon: Icon } = blockMetaFor(type);
          return (
            <Icon
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
              key={type}
            />
          );
        })}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {minutes} min
      </span>
      {href === null ? (
        <Lock aria-label="Enroll to open" className="size-3.5 text-muted-foreground" />
      ) : null}
    </>
  );

  if (href === null) {
    return <div className="flex items-center gap-2 px-4 py-2.5">{content}</div>;
  }

  return (
    <Link
      className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted"
      href={href}
    >
      {content}
    </Link>
  );
}
