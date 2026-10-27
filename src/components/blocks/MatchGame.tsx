"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { MatchPair } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

/**
 * Match game: connect each item on the left with its partner on the right.
 *
 * One pick on each side makes an attempt. A correct pair locks both cards in
 * green; a wrong one shakes the right-hand card and clears the selection so the
 * learner can try again. The attempt counter is shown so a clean run feels
 * worth retrying for.
 */

/** How long a wrong pair stays on screen before the selection resets. */
const WRONG_PAIR_DELAY_MS = 600;

/**
 * Stable scramble for the right-hand column.
 *
 * A random shuffle would render one order on the server and another on the
 * client, so the order is derived from the text: identical content always
 * produces the same layout, and the two columns never line up by accident.
 */
function stableHash(value: string): number {
  let hash = 7;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }

  return hash;
}

export type MatchGameProps = {
  pairs: MatchPair[];
  completed: boolean;
  /** Called when every pair has been matched. */
  onComplete: () => void;
  /** Raised once per run so the page can record the finish event. */
  onFinish: (payload: Record<string, unknown>) => void;
};

const CARD_BASE =
  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const CARD_IDLE = "bg-muted/50 ring-1 ring-foreground/10 hover:bg-muted";
const CARD_MATCHED =
  "cursor-default bg-emerald-500/10 ring-1 ring-emerald-500/40";
const CARD_PICKED = "bg-primary/10 ring-2 ring-primary";

export function MatchGame({
  pairs,
  completed,
  onComplete,
  onFinish,
}: MatchGameProps) {
  /** Indices of the right-hand column, in the order they are displayed. */
  const rightOrder = useMemo(
    () =>
      pairs
        .map((_, index) => index)
        .sort(
          (a, b) =>
            stableHash(pairs[a].left) - stableHash(pairs[b].left) || a - b,
        ),
    [pairs],
  );

  /** Pair indices already matched. */
  const t = useT();
  const choicesRef = useRef<{ left: number; right: number }[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [pickedLeft, setPickedLeft] = useState<number | null>(null);
  const [wrongRight, setWrongRight] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const resetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  function pickLeft(index: number): void {
    if (solved || matched.includes(index)) {
      return;
    }
    setPickedLeft(index);
    setNotice(null);
  }

  function pickRight(index: number): void {
    if (solved || matched.includes(index)) {
      return;
    }

    if (pickedLeft === null) {
      setNotice(t("block.match.pickLeftFirst"));
      return;
    }

    // Ignore further picks while the previous miss is still shaking.
    if (resetTimerRef.current !== null) {
      return;
    }

    const taken = attempts + 1;
    setAttempts(taken);
    choicesRef.current.push({ left: pickedLeft, right: index });
    onFinish({
      variant: "match",
      attempts: taken,
      choices: [...choicesRef.current],
    });

    if (pickedLeft === index) {
      const nextMatched = [...matched, index];
      setMatched(nextMatched);
      setPickedLeft(null);
      setNotice(null);

      if (nextMatched.length === pairs.length) {
        setSolved(true);
        setNotice(
          t("block.match.solved", { count: pairs.length, attempts: taken }),
        );
      }
      return;
    }

    setWrongRight(index);
    setNotice(t("block.match.wrong"));
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setWrongRight(null);
      setPickedLeft(null);
    }, WRONG_PAIR_DELAY_MS);
  }

  function startOver(): void {
    choicesRef.current = [];
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setMatched([]);
    setPickedLeft(null);
    setWrongRight(null);
    setAttempts(0);
    setNotice(null);
    setSolved(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("block.match.instruction")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ul className="space-y-2">
          {pairs.map((pair, index) => {
            const isMatched = matched.includes(index);

            return (
              <li key={pair.left}>
                <button
                  aria-pressed={pickedLeft === index}
                  className={cn(
                    CARD_BASE,
                    isMatched
                      ? CARD_MATCHED
                      : pickedLeft === index
                        ? CARD_PICKED
                        : CARD_IDLE,
                  )}
                  disabled={isMatched}
                  onClick={() => {
                    pickLeft(index);
                  }}
                  type="button"
                >
                  <span>{pair.left}</span>
                  {isMatched ? (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 text-emerald-600"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="space-y-2">
          {rightOrder.map((pairIndex) => {
            const isMatched = matched.includes(pairIndex);
            const isWrong = wrongRight === pairIndex;

            return (
              <li key={pairs[pairIndex].right}>
                <button
                  className={cn(
                    CARD_BASE,
                    isMatched
                      ? CARD_MATCHED
                      : isWrong
                        ? "bg-red-500/10 ring-1 ring-red-500/40"
                        : CARD_IDLE,
                  )}
                  disabled={isMatched}
                  onClick={() => {
                    pickRight(pairIndex);
                  }}
                  style={
                    isWrong
                      ? {
                          animation: `match-shake ${WRONG_PAIR_DELAY_MS}ms ease-in-out`,
                        }
                      : undefined
                  }
                  type="button"
                >
                  <span>{pairs[pairIndex].right}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startOver} variant="outline">
          <RotateCcw aria-hidden="true" />
          {t("common.startOver")}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t("block.match.attempts", {
            attempts,
            matched: matched.length,
            total: pairs.length,
          })}
        </span>
      </div>

      {notice === null ? null : (
        <p
          className={cn(
            "text-xs",
            solved ? "text-emerald-600" : "text-muted-foreground",
          )}
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
          {solved || completed ? t("block.match.done") : t("block.match.need")}
        </p>
      </div>
    </div>
  );
}
