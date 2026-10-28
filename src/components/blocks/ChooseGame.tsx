"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { ChooseOption } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import type { GameRecovery } from "./GameBlock";

export type ChooseGameProps = {
  prompt: string;
  options: ChooseOption[];
  completed: boolean;
  onComplete: () => void;
  onFinish: (payload: Record<string, unknown>) => void;
  recovery?: GameRecovery;
};

export function ChooseGame({
  prompt,
  options,
  completed,
  onComplete,
  onFinish,
  recovery,
}: ChooseGameProps) {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [playthrough, setPlaythrough] = useState(1);
  const playthroughId = useRef(crypto.randomUUID());

  useEffect(() => {
    const attempts = recovery?.attempts ?? [];
    if (attempts.length === 0) return;
    const submissions = attempts.filter((attempt) => attempt.answer.kind !== "hint");
    const latest = submissions.at(-1);
    if (!latest) return;
    const answer = latest.answer;
    queueMicrotask(() => {
      if (typeof answer.option === "number") setSelected(answer.option);
      setAttempts(
        typeof answer.attempts === "number" ? answer.attempts : submissions.length,
      );
      setHintsUsed(
        attempts.filter((attempt) => attempt.answer.kind === "hint").length,
      );
      setSolved(latest.completed);
      if (typeof answer.playthrough === "number") setPlaythrough(answer.playthrough);
      if (typeof answer.playthroughId === "string")
        playthroughId.current = answer.playthroughId;
    });
  }, [recovery]);

  function choose(index: number): void {
    if (solved) return;
    const taken = attempts + 1;
    const correct = options[index]?.correct === true;
    setAttempts(taken);
    setSelected(index);
    onFinish({
      variant: "choose",
      attempts: taken,
      option: index,
      hintsUsed,
      submission: taken === 1 ? "first" : "retry",
      playthrough,
      playthroughId: playthroughId.current,
    });

    if (correct) {
      setSolved(true);
      setNotice(t("block.choose.correct"));
    } else {
      setNotice(
        t("block.choose.correction", {
          answer: options.find((option) => option.correct)?.text ?? "",
        }),
      );
    }
  }

  function showHint(): void {
    setHintsUsed((count) => count + 1);
    onFinish({
      kind: "hint",
      playthrough,
      playthroughId: playthroughId.current,
    });
    setHint(
      t("block.choose.hint", {
        answer: options.find((option) => option.correct)?.text ?? "",
      }),
    );
  }

  function startOver(): void {
    setSelected(null);
    setSolved(false);
    setAttempts(0);
    setNotice(null);
    setHintsUsed(0);
    setHint(null);
    const nextPlaythroughId = crypto.randomUUID();
    setPlaythrough((run) => run + 1);
    playthroughId.current = nextPlaythroughId;
    onFinish({ kind: "replay", playthroughId: nextPlaythroughId });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{prompt}</p>
      <p className="text-xs text-muted-foreground">
        {t("block.choose.instruction")}
      </p>
      <div
        aria-label={t("block.choose.progress", {
          current: solved ? 1 : 0,
          total: 1,
        })}
        aria-valuemax={1}
        aria-valuemin={0}
        aria-valuenow={solved ? 1 : 0}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: solved ? "100%" : "0%" }}
        />
      </div>
      <div className="grid gap-2">
        {options.map((option, index) => (
          <button
            aria-pressed={selected === index}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              selected === index
                ? solved
                  ? "bg-emerald-500/10 ring-1 ring-emerald-500/40"
                  : "bg-primary/10 ring-2 ring-primary"
                : "bg-muted/50 ring-1 ring-foreground/10 hover:bg-muted",
            )}
            disabled={solved}
            key={option.text}
            onClick={() => choose(index)}
            type="button"
          >
            <span className="flex-1">{option.text}</span>
            {solved && selected === index ? (
              <Check
                aria-hidden="true"
                className="size-4 shrink-0 text-emerald-600"
              />
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startOver} variant="outline">
          <RotateCcw aria-hidden="true" />
          {attempts > 0 ? t("common.replay") : t("common.startOver")}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("block.choose.attempts", { count: attempts })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={solved} onClick={showHint} variant="ghost">
          {t("common.hint")}
        </Button>
        {hint === null ? null : (
          <p
            aria-live="polite"
            className="text-xs text-muted-foreground"
            role="status"
          >
            {hint}
          </p>
        )}
      </div>
      {notice === null ? null : (
        <p
          className={cn(
            "text-xs",
            solved ? "text-emerald-600" : "text-muted-foreground",
          )}
          role="status"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          disabled={!solved || completed}
          onClick={onComplete}
          variant={completed ? "secondary" : "default"}
        >
          {completed ? (
            <>
              <Check aria-hidden="true" />
              {t("common.completed")}
            </>
          ) : (
            t("common.markComplete")
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          {solved || completed ? t("block.choose.done") : t("block.choose.need")}
        </p>
      </div>
    </div>
  );
}
