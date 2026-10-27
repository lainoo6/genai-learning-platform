"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import { blockMetaFor } from "@/lib/blocks/meta";
import type { BlockType } from "@/lib/blocks/schema";
import { SUGGESTED_BLOCK_TYPES } from "@/lib/llm/prompts/outline";
import {
  countWizardLessons,
  nextWizardKey,
  type WizardLesson,
  type WizardOutline,
} from "./wizard-types";

/**
 * Step 2 of the course wizard: the editable outline.
 *
 * Every row is a controlled input over the wizard's outline state, so an edit
 * is immediately visible in step 3 and in the saved course. Modules can be
 * retitled or removed, lessons can be retitled, re-summarised, reordered within
 * their module, deleted or added, and the suggested block types are toggles —
 * the plan is a draft, not a contract.
 *
 * "Regenerate" sends the whole brief back with an extra note, which is how an
 * instructor steers a second attempt without retyping the form.
 */

export type OutlineEditorProps = {
  outline: WizardOutline;
  onChange: (next: WizardOutline) => void;
  onBack: () => void;
  onContinue: () => void;
  onRegenerate: (extraNotes: string) => void;
  isRegenerating: boolean;
  error: string | null;
};

const MAX_MODULES = 3;
const MAX_SUGGESTED_BLOCKS = 5;

export function OutlineEditor(props: OutlineEditorProps) {
  const {
    outline,
    onChange,
    onBack,
    onContinue,
    onRegenerate,
    isRegenerating,
    error,
  } = props;

  const t = useT();
  const [extraNotes, setExtraNotes] = useState("");

  const totalLessons = countWizardLessons(outline);

  function updateModule(moduleKey: string, title: string): void {
    onChange({
      ...outline,
      modules: outline.modules.map((courseModule) =>
        courseModule.key === moduleKey ? { ...courseModule, title } : courseModule,
      ),
    });
  }

  function updateLesson(
    moduleKey: string,
    lessonKey: string,
    patch: Partial<WizardLesson>,
  ): void {
    onChange({
      ...outline,
      modules: outline.modules.map((courseModule) =>
        courseModule.key === moduleKey
          ? {
              ...courseModule,
              lessons: courseModule.lessons.map((lesson) =>
                lesson.key === lessonKey ? { ...lesson, ...patch } : lesson,
              ),
            }
          : courseModule,
      ),
    });
  }

  function updateLessons(
    moduleKey: string,
    update: (lessons: WizardLesson[]) => WizardLesson[],
  ): void {
    onChange({
      ...outline,
      modules: outline.modules.map((courseModule) =>
        courseModule.key === moduleKey
          ? { ...courseModule, lessons: update(courseModule.lessons) }
          : courseModule,
      ),
    });
  }

  function addLesson(moduleKey: string): void {
    updateLessons(moduleKey, (lessons) => [
      ...lessons,
      {
        key: nextWizardKey("lesson"),
        title: "New lesson",
        summary: "",
        suggestedBlocks: ["reading", "quiz"],
      },
    ]);
  }

  function removeLesson(moduleKey: string, lessonKey: string): void {
    updateLessons(moduleKey, (lessons) =>
      lessons.filter((lesson) => lesson.key !== lessonKey),
    );
  }

  function moveLesson(
    moduleKey: string,
    lessonKey: string,
    direction: -1 | 1,
  ): void {
    updateLessons(moduleKey, (lessons) => {
      const index = lessons.findIndex((lesson) => lesson.key === lessonKey);
      const target = index + direction;

      if (index < 0 || target < 0 || target >= lessons.length) {
        return lessons;
      }

      const next = [...lessons];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function toggleBlock(
    moduleKey: string,
    lesson: WizardLesson,
    type: BlockType,
  ): void {
    const selected = lesson.suggestedBlocks.includes(type);

    if (selected && lesson.suggestedBlocks.length === 1) {
      return;
    }
    if (!selected && lesson.suggestedBlocks.length >= MAX_SUGGESTED_BLOCKS) {
      return;
    }

    updateLesson(moduleKey, lesson.key, {
      suggestedBlocks: selected
        ? lesson.suggestedBlocks.filter((entry) => entry !== type)
        : [...lesson.suggestedBlocks, type],
    });
  }

  function removeModule(moduleKey: string): void {
    onChange({
      ...outline,
      modules: outline.modules.filter(
        (courseModule) => courseModule.key !== moduleKey,
      ),
    });
  }

  function addModule(): void {
    onChange({
      ...outline,
      modules: [
        ...outline.modules,
        {
          key: nextWizardKey("module"),
          title: t("wizard.outline.newModuleTitle", {
            index: outline.modules.length + 1,
          }),
          lessons: [
            {
              key: nextWizardKey("lesson"),
              title: t("wizard.outline.newLessonTitle"),
              summary: "",
              suggestedBlocks: ["reading", "quiz"],
            },
          ],
        },
      ],
    });
  }

  const canRemoveModule = outline.modules.length > 1;
  const canRemoveLesson = totalLessons > 1;

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl ring-1 ring-foreground/10">
        <div className="space-y-4 px-4 py-5 sm:px-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="outline-title">
              {t("wizard.outline.courseTitle")}
            </label>
            <Input
              id="outline-title"
              maxLength={90}
              onChange={(event) => {
                onChange({ ...outline, title: event.target.value });
              }}
              value={outline.title}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="outline-description">
              {t("wizard.outline.description")}
            </label>
            <Textarea
              id="outline-description"
              maxLength={600}
              onChange={(event) => {
                onChange({ ...outline, description: event.target.value });
              }}
              rows={3}
              value={outline.description}
            />
          </div>
        </div>

        <div className="space-y-3 border-t px-4 py-4 sm:px-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="outline-revision">
              {t("wizard.outline.revise")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("generate.form.optional")}
              </span>
            </label>
            <Textarea
              disabled={isRegenerating}
              id="outline-revision"
              maxLength={500}
              onChange={(event) => {
                setExtraNotes(event.target.value);
              }}
              placeholder={t("wizard.outline.revisePlaceholder")}
              rows={2}
              value={extraNotes}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isRegenerating}
              onClick={() => {
                onRegenerate(extraNotes);
              }}
              variant="outline"
            >
              {isRegenerating ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  {t("wizard.outline.replanning")}
                </>
              ) : (
                <>
                  <RefreshCw aria-hidden="true" />
                  {t("wizard.outline.regenerate")}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("wizard.outline.discardNote")}
            </p>
          </div>

          {error === null ? null : (
            <p
              aria-live="polite"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t("wizard.outline.modulesLessons")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("wizard.outline.summary", {
            modules: outline.modules.length,
            lessons: totalLessons,
          })}
        </p>
      </div>

      <div className="space-y-4">
        {outline.modules.map((courseModule, moduleIndex) => (
          <section className="rounded-xl ring-1 ring-foreground/10" key={courseModule.key}>
            <div className="flex items-start gap-2 border-b px-4 py-3">
              <span className="mt-2 text-xs text-muted-foreground tabular-nums">
                {moduleIndex + 1}
              </span>
              <div className="flex-1 space-y-1">
                <label
                  className="sr-only"
                  htmlFor={`module-title-${courseModule.key}`}
                >
                  {t("wizard.outline.moduleTitleAria")}
                </label>
                <Input
                  className="font-medium"
                  id={`module-title-${courseModule.key}`}
                  maxLength={80}
                  onChange={(event) => {
                    updateModule(courseModule.key, event.target.value);
                  }}
                  value={courseModule.title}
                />
              </div>
              <Button
                aria-label={t("wizard.outline.deleteModule")}
                className="text-muted-foreground hover:text-destructive"
                disabled={!canRemoveModule}
                onClick={() => {
                  removeModule(courseModule.key);
                }}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>

            <div className="space-y-3 px-4 py-4">
              {courseModule.lessons.map((lesson, lessonIndex) => (
                <div className="rounded-lg border px-3 py-3" key={lesson.key}>
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-4 text-xs text-muted-foreground tabular-nums">
                      {lessonIndex + 1}
                    </span>

                    <div className="min-w-0 flex-1 space-y-2">
                      <label
                        className="sr-only"
                        htmlFor={`lesson-title-${lesson.key}`}
                      >
                        {t("wizard.outline.lessonTitleAria")}
                      </label>
                      <Input
                        id={`lesson-title-${lesson.key}`}
                        maxLength={120}
                        onChange={(event) => {
                          updateLesson(courseModule.key, lesson.key, {
                            title: event.target.value,
                          });
                        }}
                        value={lesson.title}
                      />

                      <label
                        className="sr-only"
                        htmlFor={`lesson-summary-${lesson.key}`}
                      >
                        {t("wizard.outline.lessonSummaryAria")}
                      </label>
                      <Textarea
                        id={`lesson-summary-${lesson.key}`}
                        maxLength={400}
                        onChange={(event) => {
                          updateLesson(courseModule.key, lesson.key, {
                            summary: event.target.value,
                          });
                        }}
                        placeholder={t("wizard.outline.lessonSummaryPlaceholder")}
                        rows={2}
                        value={lesson.summary}
                      />

                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_BLOCK_TYPES.map((type) => {
                          const selected = lesson.suggestedBlocks.includes(type);

                          return (
                            <button
                              aria-pressed={selected}
                              className={
                                selected
                                  ? "rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                                  : "rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                              }
                              key={type}
                              onClick={() => {
                                toggleBlock(courseModule.key, lesson, type);
                              }}
                              type="button"
                            >
                              {t(blockMetaFor(type).labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Button
                        aria-label={t("wizard.outline.moveLessonUp")}
                        disabled={lessonIndex === 0}
                        onClick={() => {
                          moveLesson(courseModule.key, lesson.key, -1);
                        }}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={t("wizard.outline.moveLessonDown")}
                        disabled={lessonIndex === courseModule.lessons.length - 1}
                        onClick={() => {
                          moveLesson(courseModule.key, lesson.key, 1);
                        }}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={t("wizard.outline.deleteLesson")}
                        className="text-muted-foreground hover:text-destructive"
                        disabled={!canRemoveLesson}
                        onClick={() => {
                          removeLesson(courseModule.key, lesson.key);
                        }}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              <Button
                onClick={() => {
                  addLesson(courseModule.key);
                }}
                size="sm"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                {t("editor.structure.addLesson")}
              </Button>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft aria-hidden="true" />
          {t("wizard.outline.back")}
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={outline.modules.length >= MAX_MODULES}
            onClick={addModule}
            variant="ghost"
          >
            <Plus aria-hidden="true" />
            {t("editor.structure.addModule")}
          </Button>
          <Button
            disabled={totalLessons === 0 || outline.title.trim().length < 3}
            onClick={onContinue}
          >
            {t("wizard.outline.continueToLessons")}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
