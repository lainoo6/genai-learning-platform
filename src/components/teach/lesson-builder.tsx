"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { blockMetaFor } from "@/lib/blocks/meta";
import {
  countWizardLessons,
  flattenWizardLessons,
  type LessonJob,
  type WizardOutline,
} from "./wizard-types";

/**
 * Step 3 of the course wizard: write the lessons one by one.
 *
 * Each row generates independently, so a slow or failing lesson never blocks
 * the others and the instructor can fix one title and regenerate just that
 * lesson. A regeneration that fails keeps the previous version on screen —
 * `jobs[key].lesson` is deliberately preserved by the parent — which is what
 * makes the error recoverable instead of destructive.
 */

export type LessonBuilderProps = {
  outline: WizardOutline;
  jobs: Record<string, LessonJob>;
  onGenerate: (lessonKey: string) => void;
  onGenerateAll: () => void;
  isBatchRunning: boolean;
  onBack: () => void;
  onContinue: () => void;
};

export function LessonBuilder(props: LessonBuilderProps) {
  const {
    outline,
    jobs,
    onGenerate,
    onGenerateAll,
    isBatchRunning,
    onBack,
    onContinue,
  } = props;

  const t = useT();
  const total = countWizardLessons(outline);
  const flattened = flattenWizardLessons(outline);
  const ready = flattened.filter(
    (item) => jobs[item.lesson.key]?.lesson != null,
  ).length;
  const indexByKey = new Map(
    flattened.map((item) => [item.lesson.key, item.index] as const),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{t("wizard.lessons.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("wizard.lessons.subtitle")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("wizard.lessons.ready", { ready, total })}
        </p>
      </div>

      <div className="space-y-5">
        {outline.modules.map((courseModule, moduleIndex) => (
          <section className="space-y-2" key={courseModule.key}>
            <h3 className="flex items-baseline gap-2 text-sm font-medium">
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("editor.structure.moduleNumber", { index: moduleIndex + 1 })}
              </span>
              {courseModule.title}
            </h3>

            <ul className="space-y-2">
              {courseModule.lessons.map((lesson) => {
                const job: LessonJob = jobs[lesson.key] ?? {
                  status: "idle",
                  error: null,
                  lesson: null,
                };
                const index = indexByKey.get(lesson.key) ?? 0;
                const isRunning = job.status === "running";
                const hasLesson = job.lesson !== null;

                return (
                  <li
                    className="rounded-xl px-4 py-3 ring-1 ring-foreground/10"
                    key={lesson.key}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium">{lesson.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {lesson.summary.length === 0
                            ? t("wizard.lessons.noSummary")
                            : lesson.summary}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {lesson.suggestedBlocks.map((type) => (
                            <Badge key={type} variant="outline">
                              {t(blockMetaFor(type).labelKey)}
                            </Badge>
                          ))}
                        </div>

                        {isRunning ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                            {t("wizard.lessons.writing")}
                          </p>
                        ) : null}

                        {job.status === "error" && job.error !== null ? (
                          <p
                            aria-live="polite"
                            className="flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-700"
                          >
                            <TriangleAlert
                              aria-hidden="true"
                              className="mt-0.5 size-3.5 shrink-0"
                            />
                            <span>
                              {job.error}
                              {hasLesson ? t("wizard.lessons.previousKept") : ""}
                            </span>
                          </p>
                        ) : null}

                        {hasLesson && job.status !== "running" ? (
                          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                            <Check aria-hidden="true" className="size-3.5" />
                            {t("editor.course.blocksCount", {
                              count: job.lesson?.blocks.length ?? 0,
                            })}{" "}
                            · {t("lesson.minutes", {
                              count: job.lesson?.estimatedMinutes ?? 0,
                            })}
                          </p>
                        ) : null}

                        {!hasLesson && job.status === "idle" ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Circle aria-hidden="true" className="size-2" />
                            {t("wizard.lessons.notWritten")}
                          </p>
                        ) : null}
                      </div>

                      <Button
                        disabled={isRunning || isBatchRunning}
                        onClick={() => {
                          onGenerate(lesson.key);
                        }}
                        size="sm"
                        variant={hasLesson ? "outline" : "default"}
                      >
                        {isRunning ? (
                          <>
                            <Loader2 aria-hidden="true" className="animate-spin" />
                            {t("wizard.lessons.writing")}
                          </>
                        ) : (
                          <>
                            <Sparkles aria-hidden="true" />
                            {hasLesson
                              ? t("wizard.lessons.regenerate")
                              : t("wizard.lessons.generate")}
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft aria-hidden="true" />
          {t("wizard.lessons.back")}
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={isBatchRunning || ready === total}
            onClick={onGenerateAll}
            variant="ghost"
          >
            {isBatchRunning ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                {t("wizard.lessons.writing")}
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" />
                {t("wizard.lessons.generateRest")}
              </>
            )}
          </Button>
          <Button disabled={ready < total} onClick={onContinue}>
            {t("wizard.lessons.review")}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
