"use client";

import { Check, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { blockMetaFor } from "@/lib/blocks/meta";
import { cn } from "@/lib/utils";

export type OutlineLesson = {
  id: string;
  title: string;
  blockTypes: string[];
  minutes: number;
  completed: boolean;
};

export type OutlineModule = {
  id: string;
  title: string;
  lessons: OutlineLesson[];
};

/**
 * Course contents for the lesson player.
 *
 * Desktop keeps it as a sticky rail; below `lg` the same data lives in a
 * drawer opened from the "Contents" button (Escape or the backdrop closes it).
 */
export function LessonOutline({
  courseId,
  currentLessonId,
  modules,
}: {
  courseId: string;
  currentLessonId: string;
  modules: OutlineModule[];
}) {
  const t = useT();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isDrawerOpen]);

  const rail = (
    <OutlineList
      courseId={courseId}
      currentLessonId={currentLessonId}
      modules={modules}
      onNavigate={() => {
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <>
      <Button
        className="w-fit lg:hidden"
        onClick={() => {
          setDrawerOpen(true);
        }}
        variant="outline"
      >
        <Menu aria-hidden="true" />
        {t("lesson.outline.contents")}
      </Button>

      <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
        {rail}
      </aside>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={t("lesson.outline.close")}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => {
              setDrawerOpen(false);
            }}
            type="button"
          />
          <div
            aria-label={t("lesson.outline.courseContents")}
            aria-modal="true"
            className="absolute inset-y-0 left-0 w-80 max-w-[85%] overflow-y-auto border-r bg-background p-4"
            role="dialog"
          >
            <Button
              className="mb-3"
              onClick={() => {
                setDrawerOpen(false);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <X aria-hidden="true" />
              <span className="sr-only">{t("lesson.outline.close")}</span>
            </Button>
            {rail}
          </div>
        </div>
      ) : null}
    </>
  );
}

function OutlineList({
  courseId,
  currentLessonId,
  modules,
  onNavigate,
}: {
  courseId: string;
  currentLessonId: string;
  modules: OutlineModule[];
  onNavigate: () => void;
}) {
  const t = useT();

  return (
    <nav
      aria-label={t("lesson.outline.courseContents")}
      className="space-y-4 text-sm"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("lesson.outline.courseContents")}
      </p>

      {modules.map((courseModule) => (
        <div key={courseModule.id}>
          <p className="px-2 text-xs text-muted-foreground">
            {courseModule.title}
          </p>
          <ol className="mt-1 space-y-0.5">
            {courseModule.lessons.map((lesson) => {
              const isCurrent = lesson.id === currentLessonId;

              return (
                <li key={lesson.id}>
                  <Link
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors",
                      isCurrent
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted",
                    )}
                    href={`/learn/${courseId}/${lesson.id}`}
                    onClick={onNavigate}
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {lesson.completed ? (
                        <Check
                          aria-hidden="true"
                          className="size-3.5 text-emerald-600"
                        />
                      ) : (
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            isCurrent ? "bg-primary" : "bg-muted-foreground/40",
                          )}
                        />
                      )}
                    </span>

                    <span className="flex-1 leading-snug">
                      {lesson.title}
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {lesson.blockTypes.map((type) => {
                          const { icon: Icon } = blockMetaFor(type);
                          return <Icon aria-hidden="true" className="size-3" key={type} />;
                        })}
                        <span>
                          {t("lesson.outline.minutes", {
                            count: lesson.minutes,
                          })}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}
