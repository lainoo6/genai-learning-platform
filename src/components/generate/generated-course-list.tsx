"use client";

import { ArrowRight, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteGeneratedCourse } from "@/server/generate";

/** One row rendered in the generation history, already serialised by the page. */
export type GeneratedCourseItem = {
  id: string;
  title: string;
  lessonCount: number;
  firstLessonId: string | null;
  createdAt: string;
};

/**
 * History of the learner's generated courses: reopen one, or delete it.
 *
 * Deletion is guarded by a confirmation and then re-rendered through
 * `router.refresh()`, so the list always mirrors the database rather than a
 * local copy that could drift from a failed request.
 */
export function GeneratedCourseList({
  courses,
}: {
  courses: GeneratedCourseItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(course: GeneratedCourseItem): Promise<void> {
    const confirmed = window.confirm(
      `Delete "${course.title}"? Its lessons and your progress in it will be removed.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setPendingId(course.id);

    try {
      const result = await deleteGeneratedCourse(course.id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The course could not be deleted. Try again.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error === null ? null : (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => (
          <li
            className="flex flex-col gap-3 rounded-xl px-4 py-3 ring-1 ring-foreground/10"
            key={course.id}
          >
            <div className="space-y-1">
              <p className="text-sm font-medium">{course.title}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{course.createdAt}</span>
                <Badge variant="secondary">{course.lessonCount} lessons</Badge>
              </p>
            </div>

            <div className="mt-auto flex items-center gap-2">
              {course.firstLessonId === null ? (
                <Badge variant="outline">No lessons</Badge>
              ) : (
                <Link
                  className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                  href={`/learn/${course.id}/${course.firstLessonId}`}
                >
                  Open
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}

              <Button
                aria-label={`Delete ${course.title}`}
                className="ml-auto"
                disabled={pendingId === course.id}
                onClick={() => {
                  void remove(course);
                }}
                size="sm"
                variant="ghost"
              >
                {pendingId === course.id ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
