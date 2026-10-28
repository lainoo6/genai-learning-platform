"use client";

import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { ChooseOption } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

export type ChooseGameProps = {
  prompt: string;
  options: ChooseOption[];
  completed: boolean;
  onComplete: () => void;
  onFinish: (payload: Record<string, unknown>) => void;
};

export function ChooseGame({
  prompt,
  options,
  completed,
  onComplete,
  onFinish,
}: ChooseGameProps) {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  function choose(index: number): void {
    if (solved) return;
    const taken = attempts + 1;
    const correct = options[index]?.correct === true;
    setAttempts(taken);
    setSelected(index);
    onFinish({ variant: "choose", attempts: taken, option: index });

    if (correct) {
      setSolved(true);
      setNotice(t("block.choose.correct"));
    } else {
      setNotice(t("block.choose.incorrect"));
    }
  }

  function startOver(): void {
    setSelected(null);
    setSolved(false);
    setAttempts(0);
    setNotice(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{prompt}</p>
      <p className="text-xs text-muted-foreground">
        {t("block.choose.instruction")}
      </p>
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
          {t("common.startOver")}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("block.choose.attempts", { count: attempts })}
        </span>
      </div>
      {notice === null ? null : (
        <p className={cn("text-xs", solved ? "text-emerald-600" : "text-muted-foreground")}>
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
