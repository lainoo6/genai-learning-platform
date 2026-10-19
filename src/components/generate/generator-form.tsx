"use client";

import { Check, Circle, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { generateLearnerCourse } from "@/server/generate";

/**
 * One-field generator for the /generate page (P4.7).
 *
 * The server action returns the finished course, so the three-step animation is
 * paced here: the steps advance on a timer while the request is in flight and
 * the redirect waits until the last step has been visible. A failure keeps the
 * learner's topic on screen and offers a retry instead of a blank page.
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

export function GeneratorForm() {
  const t = useT();
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [stage, setStage] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  async function generate(): Promise<void> {
    const trimmedTopic = topic.trim();
    if (isRunning) {
      return;
    }
    if (trimmedTopic.length < 3) {
      setError(t("generate.error.topic"));
      return;
    }

    setError(null);
    setIsRunning(true);
    setStage(0);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      setStage((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    try {
      const result = await generateLearnerCourse({
        topic: trimmedTopic,
        goal: goal.trim(),
      });

      if (!result.ok) {
        setError(result.error);
        setStage(-1);
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_VISIBLE_MS) {
        await new Promise((resolve) => {
          setTimeout(resolve, MIN_VISIBLE_MS - elapsed);
        });
      }

      setStage(STEPS.length);
      router.push(`/learn/${result.courseId}/${result.lessonId}`);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("generate.error.failed"),
      );
      setStage(-1);
    } finally {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRunning(false);
    }
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
            {isRunning ? (
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
