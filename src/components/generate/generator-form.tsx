"use client";

import { Check, Circle, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    label: "Planning the outline",
    detail: "Course title, three lesson titles and the arc between them.",
  },
  {
    label: "Writing the lessons",
    detail: "A reading block for each lesson, grounded in the topic.",
  },
  {
    label: "Building interactive blocks",
    detail: "Flashcards or a game, plus a quiz to check understanding.",
  },
] as const;

const STEP_INTERVAL_MS = 1100;
const MIN_VISIBLE_MS = 2400;

export function GeneratorForm() {
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
      setError("Give the course a topic of at least three characters.");
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
          : "The course could not be generated. Try again in a moment.",
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
            What do you want to learn about?
          </label>
          <Input
            disabled={isRunning}
            id="topic"
            maxLength={120}
            onChange={(event) => {
              setTopic(event.target.value);
            }}
            placeholder="K-pop fandom economics"
            value={topic}
          />
          <p className="text-xs text-muted-foreground">
            Any topic works — the generator builds a three-lesson mini-course
            around it.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="goal">
            Your goal <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            disabled={isRunning}
            id="goal"
            maxLength={300}
            onChange={(event) => {
              setGoal(event.target.value);
            }}
            placeholder="I want to understand why fans spend money on merchandise."
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
                Generating…
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" />
                Generate my course
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            You will be enrolled automatically and taken to the first lesson.
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
              <li className="flex items-start gap-3" key={step.label}>
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
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {stage >= STEPS.length ? (
          <p className="text-sm text-emerald-600">
            Course ready — opening your first lesson…
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
