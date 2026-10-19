import { Check, ChevronLeft, Clock, Lock } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { CONTENT_LANGUAGES } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { blockMetaFor } from "@/lib/blocks/meta";
import {
  countLessons,
  totalMinutes,
  type CourseWithLessons,
} from "@/lib/courses";
import { EnrollButton } from "./enroll-button";

/** Dictionary keys for the two enums shown as badges. */
const DIFFICULTY_KEYS: Record<string, string> = {
  beginner: "courses.difficulty.beginner",
  intermediate: "courses.difficulty.intermediate",
  advanced: "courses.difficulty.advanced",
};

const SOURCE_KEYS: Record<string, string> = {
  SEED: "courses.source.seed",
  AI_GENERATED: "courses.source.ai",
  INSTRUCTOR: "courses.source.instructor",
  LEARNER: "courses.source.learner",
};

/**
 * Read-only course detail view: hero + module outline + enroll action.
 *
 * It is shared by `/courses/[slug]` and by the lesson player, which renders the
 * same screen (with a notice) when somebody opens a player URL for a course
 * they have not enrolled in yet.
 */
export async function CourseDetail({
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
  const { t } = await getI18n();
  const difficultyLabel =
    DIFFICULTY_KEYS[course.difficulty] === undefined
      ? course.difficulty
      : t(DIFFICULTY_KEYS[course.difficulty] as string);

  return (
    <article className="space-y-8">
      <Link
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        href="/courses"
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" />
        {t("course.back")}
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
            <Badge variant="outline">
              {SOURCE_KEYS[course.source] === undefined
                ? course.source
                : t(SOURCE_KEYS[course.source] as string)}
            </Badge>
            <Badge variant="outline">
              {t("courses.contentLanguage", {
                language: CONTENT_LANGUAGES[course.language] ?? course.language,
              })}
            </Badge>
          </div>

          <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              {t("course.summary", {
                modules: course.modules.length,
                lessons: countLessons(course),
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock aria-hidden="true" className="size-3.5" />
              {t("courses.card.minutes", { count: totalMinutes(course) })}
            </span>
            {enrolled ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check aria-hidden="true" className="size-3.5" />
                {t("course.enrolled")}
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
        <h2 className="text-sm font-medium">{t("course.outline.title")}</h2>

        {course.modules.map((courseModule) => (
          <div className="rounded-xl ring-1 ring-foreground/10" key={courseModule.id}>
            <header className="border-b px-4 py-3">
              <h3 className="text-sm font-medium">{courseModule.title}</h3>
              <p className="text-xs text-muted-foreground">
                {t("course.outline.lessons", { count: courseModule.lessons.length })}
              </p>
            </header>

            <ol className="divide-y">
              {courseModule.lessons.map((lesson, index) => (
                <li key={lesson.id}>
                  <LessonRow
                    href={enrolled ? `/learn/${course.id}/${lesson.id}` : null}
                    title={lesson.title}
                    types={lesson.blockTypes}
                    position={index + 1}
                    minutesLabel={t("course.lesson.minutes", {
                      count: lesson.estimatedMinutes,
                    })}
                    lockedLabel={t("course.lesson.locked")}
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
  minutesLabel,
  title,
  types,
  position,
  lockedLabel,
}: {
  href: string | null;
  minutesLabel: string;
  title: string;
  types: readonly string[];
  position: number;
  lockedLabel: string;
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
        {minutesLabel}
      </span>
      {href === null ? (
        <Lock aria-label={lockedLabel} className="size-3.5 text-muted-foreground" />
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
