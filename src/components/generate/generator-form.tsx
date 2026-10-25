"use client";

import { Check, Circle, FileUp, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import {
  courseFileKind,
  MAX_COURSE_FILE_BYTES,
} from "@/lib/course-file";
import { cn } from "@/lib/utils";
import {
  generateCourseFromFileAction,
  generateLearnerCourse,
  type GenerateCourseResult,
} from "@/server/generate";

/**
 * Generator form for the /generate page (P4.7 + document upload).
 *
 * Two entry points share one runner: a text prompt and a PDF/PPTX upload. The
 * server action returns the finished course, so the three-step animation is
 * paced here: the steps advance on a timer while the request is in flight and
 * the redirect waits until the last step has been visible. Non-blocking
 * warnings are shown for a moment before navigating, and a failure keeps the
 * learner's input on screen and offers a retry instead of a blank page.
 */

const STEPS = [
  {
    labelKey: "generate.steps.outline.label",
    detailKey: "generate.steps.outline.detail",
  },
  {
    labelKey: "generate.steps.lessons.label",
    detailKey: "generate.steps.lessons.detail",
  },
  {
    labelKey: "generate.steps.blocks.label",
    detailKey: "generate.steps.blocks.detail",
  },
] as const;

const STEP_INTERVAL_MS = 1100;
const MIN_VISIBLE_MS = 2400;
/** Extra time to read server warnings before the redirect. */
const WARNINGS_VISIBLE_MS = 3500;

type RunMode = "prompt" | "file";

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function GeneratorForm() {
  const t = useT();
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState(-1);
  const [activeMode, setActiveMode] = useState<RunMode | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  async function run(
    mode: RunMode,
    request: () => Promise<GenerateCourseResult>,
  ): Promise<void> {
    if (isRunning) {
      return;
    }

    setError(null);
    setWarnings([]);
    setIsRunning(true);
    setActiveMode(mode);
    setStage(0);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      setStage((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    try {
      const result = await request();

      if (!result.ok) {
        setError(result.error);
        setStage(-1);
        return;
      }

      const nextWarnings = result.warnings ?? [];
      setWarnings(nextWarnings);

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_VISIBLE_MS) {
        await sleep(MIN_VISIBLE_MS - elapsed);
      }

      if (nextWarnings.length > 0) {
        await sleep(WARNINGS_VISIBLE_MS);
      }

      setStage(STEPS.length);
      router.push(`/learn/${result.courseId}/${result.lessonId}`);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : t("generate.error.failed"),
      );
      setStage(-1);
    } finally {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRunning(false);
      setActiveMode(null);
    }
  }

  async function generate(): Promise<void> {
    const trimmedTopic = topic.trim();
    if (isRunning) {
      return;
    }
    if (trimmedTopic.length < 3) {
      setError(t("generate.error.topic"));
      return;
    }

    await run("prompt", () =>
      generateLearnerCourse({ topic: trimmedTopic, goal: goal.trim() }),
    );
  }

  async function generateFromFile(): Promise<void> {
    if (isRunning) {
      return;
    }
    if (file === null || courseFileKind(file.name) === null) {
      setError(t("generate.error.file"));
      return;
    }
    if (file.size > MAX_COURSE_FILE_BYTES) {
      setError(t("generate.error.fileTooLarge"));
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("goal", goal.trim());

    await run("file", () => generateCourseFromFileAction(formData));
  }

  return (
    <div className="space-y-4 rounded-xl ring-1 ring-foreground/10">
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="topic">
            {t("generate.form.topic.label")}
          </label>
          <Input
            disabled={isRunning}
            id="topic"
            maxLength={120}
            onChange={(event) => {
              setTopic(event.target.value);
            }}
            placeholder={t("generate.form.topic.placeholder")}
            value={topic}
          />
          <p className="text-xs text-muted-foreground">
            {t("generate.form.topic.hint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="goal">
            {t("generate.form.goal.label")}{" "}
            <span className="font-normal text-muted-foreground">
              {t("generate.form.optional")}
            </span>
          </label>
          <Textarea
            disabled={isRunning}
            id="goal"
            maxLength={300}
            onChange={(event) => {
              setGoal(event.target.value);
            }}
            placeholder={t("generate.form.goal.placeholder")}
            rows={2}
            value={goal}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={isRunning || topic.trim().length < 3}
            onClick={() => {
              void generate();
            }}
          >
            {activeMode === "prompt" ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                {t("generate.form.pending")}
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" />
                {t("generate.form.submit")}
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("generate.form.note")}
          </p>
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <label className="text-sm font-medium" htmlFor="course-file">
            {t("generate.form.file.label")}
          </label>
          <input
            accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="block w-full max-w-sm cursor-pointer rounded-lg border border-border bg-background text-sm file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isRunning}
            id="course-file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
            type="file"
          />
          <p className="text-xs text-muted-foreground">
            {t("generate.form.file.hint")}
          </p>
          <Button
            disabled={isRunning || file === null}
            onClick={() => {
              void generateFromFile();
            }}
            variant="outline"
          >
            {activeMode === "file" ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                {t("generate.form.pending")}
              </>
            ) : (
              <>
                <FileUp aria-hidden="true" />
                {t("generate.form.file.submit")}
              </>
            )}
          </Button>
        </div>
      </div>

      <div
        aria-live="polite"
        className={cn(
          "space-y-3 border-t px-4 py-4 sm:px-5",
          stage < 0 ? "hidden" : "",
        )}
      >
        <ol className="space-y-3">
          {STEPS.map((step, index) => {
            const done = stage > index;
            const active = stage === index;
            const Icon = done ? Check : active ? Loader2 : Circle;

            return (
              <li className="flex items-start gap-3" key={step.labelKey}>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    done ? "text-emerald-600" : "",
                    active ? "animate-spin text-primary" : "",
                    !done && !active ? "text-muted-foreground/50" : "",
                  )}
                />
                <div>
                  <p
                    className={cn(
                      "text-sm",
                      done || active ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {t(step.labelKey)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(step.detailKey)}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {stage >= STEPS.length ? (
          <p className="text-sm text-emerald-600">
            {t("generate.steps.ready")}
          </p>
        ) : null}
      </div>

      {warnings.length === 0 ? null : (
        <div
          aria-live="polite"
          className="mx-4 mb-4 space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 sm:mx-5"
        >
          <p className="font-medium">{t("generate.warnings.heading")}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {error === null ? null : (
        <p
          aria-live="polite"
          className="mx-4 mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:mx-5"
        >
          {error}
        </p>
      )}
    </div>
  );
}
