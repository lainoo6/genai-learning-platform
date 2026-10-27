"use client";

import { ArrowDown, ArrowUp, Layers, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import type { EditorCourse } from "@/lib/teach-editor";
import { cn } from "@/lib/utils";

/**
 * Left column of the course editor (P5.1): the module and lesson tree.
 *
 * Ordering is done with explicit up/down buttons rather than drag and drop:
 * they work with the keyboard, need no dependency, and the order only becomes
 * real when the author saves.
 */

export type StructurePanelProps = {
  course: EditorCourse;
  selectedLessonId: string | null;
  moduleIssues: Record<string, string[]>;
  lessonIssues: Record<string, string[]>;
  onSelectLesson: (lessonId: string) => void;
  onRenameModule: (moduleId: string, title: string) => void;
  onAddModule: () => void;
  onMoveModule: (index: number, delta: number) => void;
  onAddLesson: (moduleId: string) => void;
  onMoveLesson: (moduleId: string, index: number, delta: number) => void;
  onRequestDeleteModule: (moduleId: string, title: string) => void;
  onRequestDeleteLesson: (lessonId: string, title: string) => void;
};

export function StructurePanel(props: StructurePanelProps) {
  const {
    course,
    selectedLessonId,
    moduleIssues,
    lessonIssues,
    onSelectLesson,
    onRenameModule,
    onAddModule,
    onMoveModule,
    onAddLesson,
    onMoveLesson,
    onRequestDeleteModule,
    onRequestDeleteLesson,
  } = props;

  const t = useT();

  return (
    <aside className="space-y-3 self-start rounded-xl p-3 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("editor.structure.outline")}
        </p>
        <Button
          onClick={onAddModule}
          size="icon-xs"
          title={t("editor.structure.addModule")}
          variant="ghost"
        >
          <Plus aria-hidden="true" />
          <span className="sr-only">{t("editor.structure.addModule")}</span>
        </Button>
      </div>

      {course.modules.map((courseModule, moduleIndex) => {
        const issues = moduleIssues[courseModule.id] ?? [];

        return (
          <section className="space-y-1.5" key={courseModule.id}>
            <div className="flex items-center justify-between gap-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t("editor.structure.moduleNumber", { index: moduleIndex + 1 })}
              </p>
              <div className="flex items-center">
                <Button
                  aria-label={t("editor.structure.moveModuleUp", {
                    index: moduleIndex + 1,
                  })}
                  disabled={moduleIndex === 0}
                  onClick={() => {
                    onMoveModule(moduleIndex, -1);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t("editor.structure.moveModuleDown", {
                    index: moduleIndex + 1,
                  })}
                  disabled={moduleIndex === course.modules.length - 1}
                  onClick={() => {
                    onMoveModule(moduleIndex, 1);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t("editor.structure.deleteModule", {
                    index: moduleIndex + 1,
                  })}
                  disabled={course.modules.length <= 1}
                  onClick={() => {
                    onRequestDeleteModule(courseModule.id, courseModule.title);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>

            <Input
              aria-label={t("editor.structure.moduleTitleAria", {
                index: moduleIndex + 1,
              })}
              className="h-7 text-xs font-medium"
              onChange={(event) => {
                onRenameModule(courseModule.id, event.target.value);
              }}
              value={courseModule.title}
            />

            {issues.map((issue) => (
              <p className="text-[11px] text-red-600" key={issue}>
                {issue}
              </p>
            ))}

            <ul className="space-y-0.5">
              {courseModule.lessons.map((lesson, lessonIndex) => {
                const isSelected = lesson.id === selectedLessonId;
                const lessonProblem = (lessonIssues[lesson.id] ?? [])[0];

                return (
                  <li key={lesson.id}>
                    <div
                      className={cn(
                        "flex items-center gap-0.5 rounded-md pr-0.5",
                        isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                      )}
                    >
                      <button
                        className={cn(
                          "min-w-0 flex-1 truncate px-1.5 py-1.5 text-left text-xs",
                          isSelected ? "font-medium" : "text-muted-foreground",
                        )}
                        onClick={() => {
                          onSelectLesson(lesson.id);
                        }}
                        title={lesson.title}
                        type="button"
                      >
                        <span className="tabular-nums">{lessonIndex + 1}.</span>{" "}
                        {lesson.title.trim().length === 0
                          ? t("editor.structure.untitled")
                          : lesson.title}
                        <span className="ml-1 text-[10px] text-muted-foreground/70">
                          · {lesson.blocks.length}
                        </span>
                        {lessonProblem === undefined ? null : (
                          <span aria-hidden="true" className="ml-1 text-red-500">
                            ●
                          </span>
                        )}
                      </button>

                      <Button
                        aria-label={t("editor.structure.moveLessonUp", {
                          index: lessonIndex + 1,
                        })}
                        disabled={lessonIndex === 0}
                        onClick={() => {
                          onMoveLesson(courseModule.id, lessonIndex, -1);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={t("editor.structure.moveLessonDown", {
                          index: lessonIndex + 1,
                        })}
                        disabled={lessonIndex === courseModule.lessons.length - 1}
                        onClick={() => {
                          onMoveLesson(courseModule.id, lessonIndex, 1);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={t("editor.structure.deleteLesson", {
                          index: lessonIndex + 1,
                        })}
                        disabled={courseModule.lessons.length <= 1}
                        onClick={() => {
                          onRequestDeleteLesson(lesson.id, lesson.title);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Button
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                onAddLesson(courseModule.id);
              }}
              size="xs"
              variant="ghost"
            >
              <Plus aria-hidden="true" />
              {t("editor.structure.addLesson")}
            </Button>
          </section>
        );
      })}

      <p className="flex items-start gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
        <Layers aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
        {t("editor.structure.hint")}
      </p>
    </aside>
  );
}
