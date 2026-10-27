"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  Lock,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { SortItem } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

/**
 * Sort game: put the rows in the right order.
 *
 * The learner picks a row and moves it up or down. "Check order" locks every
 * row that already sits in its final place (they turn green and stop moving),
 * and reports how many are right; the rows that are still wrong can be moved
 * around the locked ones until everything fits.
 *
 * Moving only ever swaps two *unlocked* rows, so a locked row can never be
 * pushed out of the position it was verified in.
 */

export type SortGameProps = {
  items: SortItem[];
  completed: boolean;
  /** Called when every row has been locked in the right place. */
  onComplete: () => void;
  /** Raised once per run so the page can record the finish event. */
  onFinish: (payload: Record<string, unknown>) => void;
};

type Row = {
  id: number;
  text: string;
  order: number;
  locked: boolean;
};

function toRows(items: SortItem[]): Row[] {
  const rows = items
    .map((item, index) => ({
      id: index,
      text: item.text,
      order: item.order,
      locked: false,
    }))
    .sort((a, b) => a.order - b.order);
  // Deterministic rotation avoids hydration mismatch and never reveals the answer.
  return rows.length < 2 ? rows : [...rows.slice(1), rows[0]];
}

export function SortGame({
  items,
  completed,
  onComplete,
  onFinish,
}: SortGameProps) {
  /** `order` values in the order the rows should end up in. */
  const targetOrders = useMemo(
    () =>
      [...items].sort((a, b) => a.order - b.order).map((item) => item.order),
    [items],
  );

  const t = useT();
  const [rows, setRows] = useState<Row[]>(() => toRows(items));
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  /** Positions that can still be moved: everything the check has not locked. */
  const freeSlots = rows
    .map((row, index) => (row.locked ? -1 : index))
    .filter((index) => index >= 0);

  const selectedSlot = selected === null ? -1 : freeSlots.indexOf(selected);
  const canMoveUp = selectedSlot > 0;
  const canMoveDown = selectedSlot >= 0 && selectedSlot < freeSlots.length - 1;

  function move(direction: -1 | 1): void {
    if (selected === null) {
      return;
    }

    const slot = freeSlots.indexOf(selected);
    const target = freeSlots[slot + direction];
    if (slot < 0 || target === undefined) {
      return;
    }

    setRows((previous) => {
      const next = [...previous];
      const moving = next[selected];
      const displaced = next[target];
      if (moving === undefined || displaced === undefined) {
        return previous;
      }
      next[selected] = displaced;
      next[target] = moving;
      return next;
    });
    setSelected(target);
    setFeedback(null);
  }

  function checkOrder(): void {
    const nextRows = rows.map((row, index) => ({
      ...row,
      locked: row.order === targetOrders[index],
    }));
    const correct = nextRows.filter((row) => row.locked).length;
    const taken = attempts + 1;

    setRows(nextRows);
    setAttempts(taken);
    onFinish({
      variant: "sort",
      attempts: taken,
      order: rows.map((row) => row.id),
    });

    if (correct === nextRows.length) {
      setSolved(true);
      setSelected(null);
      setFeedback(t("block.sort.solved", { attempts: taken }));
      return;
    }

    setFeedback(t("block.sort.partial", { correct, total: nextRows.length }));
  }

  function startOver(): void {
    setRows(toRows(items));
    setSelected(null);
    setAttempts(0);
    setFeedback(null);
    setSolved(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("block.sort.instruction")}
      </p>

      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id}>
            <button
              aria-pressed={selected === index}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                row.locked
                  ? "cursor-default bg-emerald-500/10 ring-1 ring-emerald-500/40"
                  : selected === index
                    ? "bg-primary/10 ring-2 ring-primary"
                    : "bg-muted/50 ring-1 ring-foreground/10 hover:bg-muted",
              )}
              disabled={row.locked}
              onClick={() => {
                setSelected(index);
              }}
              type="button"
            >
              <span className="size-6 shrink-0 rounded-full bg-background text-center text-xs leading-6 ring-1 ring-foreground/10 tabular-nums">
                {index + 1}
              </span>
              <span className="flex-1">{row.text}</span>
              {row.locked ? (
                <Lock
                  aria-hidden="true"
                  className="size-4 shrink-0 text-emerald-600"
                />
              ) : null}
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label={t("block.sort.moveUp")}
          disabled={!canMoveUp}
          onClick={() => {
            move(-1);
          }}
          size="icon"
          variant="outline"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          aria-label={t("block.sort.moveDown")}
          disabled={!canMoveDown}
          onClick={() => {
            move(1);
          }}
          size="icon"
          variant="outline"
        >
          <ArrowDown aria-hidden="true" />
        </Button>

        <Button className="min-h-9" disabled={solved} onClick={checkOrder}>
          <Shuffle aria-hidden="true" />
          {t("block.sort.check")}
        </Button>

        <Button onClick={startOver} variant="ghost">
          <RotateCcw aria-hidden="true" />
          {t("common.startOver")}
        </Button>

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("block.sort.attempts", { count: attempts })}
        </span>
      </div>

      {feedback === null ? null : (
        <p
          className={cn(
            "text-xs",
            solved ? "text-emerald-600" : "text-muted-foreground",
          )}
        >
          {feedback}
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
          {solved || completed ? t("block.sort.done") : t("block.sort.need")}
        </p>
      </div>
    </div>
  );
}
