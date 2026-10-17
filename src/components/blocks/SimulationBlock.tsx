"use client";

import { ArrowRight, Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type {
  BlockRenderProps,
  SimulationBlock as SimulationBlockData,
  SimulationOption,
} from "@/lib/blocks/schema";
import { trackBlockEvent } from "@/server/progress";

/**
 * Simulation block: a branching scenario, one decision at a time.
 *
 * The learner reads a node, picks one of its options, and reads what that
 * choice led to before moving on. Reaching the `end` node closes the run with a
 * summary: the points collected and a review of every decision.
 *
 * Two guards keep a badly-authored scenario from trapping the learner: a choice
 * pointing at a node that does not exist ends the run, and so does a path longer
 * than `MAX_STEPS` (which is what a cycle would otherwise look like).
 */

/** Longest run allowed before the scenario is closed off. */
const MAX_STEPS = 20;

/** Why a run stopped, shown on the summary panel. */
type EndReason = "end" | "broken-link" | "too-many-steps";

const END_REASON_TEXT: Record<EndReason, string> = {
  end: "You reached the end of the scenario.",
  "broken-link": "That path leads nowhere, so the scenario stops here.",
  "too-many-steps": `The scenario stopped after ${MAX_STEPS} decisions.`,
};

/** One decision the learner has already made. */
type Step = {
  nodeId: string;
  nodeText: string;
  optionLabel: string;
  feedback: string;
  score: number;
};

/** A decision whose feedback is on screen, waiting for "Continue". */
type Pending = {
  step: Step;
  /** Node to move to next, or `null` when this step ends the run. */
  next: string | null;
  reason: EndReason | null;
};

export function SimulationBlock({
  block,
  completed,
  context,
  onComplete,
}: BlockRenderProps<SimulationBlockData>) {
  const { intro, start, end, nodes } = block.payload;

  const [current, setCurrent] = useState(start);
  const [history, setHistory] = useState<Step[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [endReason, setEndReason] = useState<EndReason>("end");
  const [finished, setFinished] = useState(start === end);

  const node = nodes[current];
  const endNode = nodes[end];
  const score = history.reduce((total, step) => total + step.score, 0);

  function choose(option: SimulationOption): void {
    if (node === undefined || pending !== null || finished) {
      return;
    }

    const step: Step = {
      nodeId: current,
      nodeText: node.text,
      optionLabel: option.label,
      feedback: option.feedback,
      score: option.score,
    };
    const nextHistory = [...history, step];
    setHistory(nextHistory);

    let next: string | null = option.next;
    let reason: EndReason | null = null;

    if (option.next === end) {
      next = null;
      reason = "end";
    } else if (!(option.next in nodes)) {
      next = null;
      reason = "broken-link";
    } else if (nextHistory.length >= MAX_STEPS) {
      next = null;
      reason = "too-many-steps";
    }

    if (reason !== null) {
      setEndReason(reason);
    }

    setPending({ step, next, reason });
  }

  function continueAfterFeedback(): void {
    const currentPending = pending;
    if (currentPending === null) {
      return;
    }

    setPending(null);

    if (currentPending.next === null) {
      setFinished(true);
      void trackBlockEvent(context.lessonId, block.id, "SIM_END", {
        score: history.reduce((total, step) => total + step.score, 0),
        steps: history.length,
        outcome: currentPending.reason ?? "end",
      });
      return;
    }

    setCurrent(currentPending.next);
  }

  function startOver(): void {
    setCurrent(start);
    setHistory([]);
    setPending(null);
    setEndReason("end");
    setFinished(start === end);
  }

  if (node === undefined) {
    return (
      <p className="flex items-start gap-2 text-sm text-amber-600">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        This scenario points at a step that does not exist, so it cannot be
        played.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{intro}</p>

      {finished ? (
        <div className="space-y-4 rounded-xl bg-muted/50 px-4 py-4 ring-1 ring-foreground/10">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Summary
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{score}</p>
            <p className="text-xs text-muted-foreground">
              points across {history.length} decision
              {history.length === 1 ? "" : "s"} · {END_REASON_TEXT[endReason]}
            </p>
          </div>

          {endNode === undefined ? null : (
            <p className="text-sm leading-relaxed">{endNode.text}</p>
          )}

          {history.length === 0 ? null : (
            <ol className="space-y-2 border-t pt-3">
              {history.map((step, index) => (
                <li className="text-xs" key={`${step.nodeId}-${index}`}>
                  <p className="font-medium">
                    {index + 1}. {step.optionLabel}
                  </p>
                  <p className="text-muted-foreground">{step.feedback}</p>
                  <p className="tabular-nums text-muted-foreground">
                    {step.score >= 0 ? "+" : ""}
                    {step.score} point{Math.abs(step.score) === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl bg-muted/50 px-4 py-4 ring-1 ring-foreground/10">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Decision {history.length + 1}
          </p>
          <p className="text-sm leading-relaxed">{node.text}</p>

          {pending === null ? (
            <div className="space-y-2">
              {node.options.map((option) => (
                <button
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-background px-3 py-3 text-left text-sm ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  key={option.label}
                  onClick={() => {
                    choose(option);
                  }}
                  type="button"
                >
                  <span>{option.label}</span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium">
                You chose: {pending.step.optionLabel}
              </p>
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm leading-relaxed">
                {pending.step.feedback}
              </p>
              <Button onClick={continueAfterFeedback}>
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          disabled={!finished || completed}
          onClick={() => {
            onComplete(block.id);
          }}
          variant={completed ? "secondary" : "default"}
        >
          {completed ? (
            <>
              <Check aria-hidden="true" />
              Completed
            </>
          ) : (
            "Mark as complete"
          )}
        </Button>

        <Button onClick={startOver} variant="ghost">
          <RotateCcw aria-hidden="true" />
          Start over
        </Button>

        <p className="text-xs text-muted-foreground">
          {finished || completed
            ? "Play it again to try the other branches."
            : "Pick the option you would really take — there is no single right path."}
        </p>
      </div>
    </div>
  );
}
