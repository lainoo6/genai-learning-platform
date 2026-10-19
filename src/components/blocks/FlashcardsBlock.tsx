"use client";

import { Check, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { useT } from "@/i18n/client";
import type {
  BlockRenderProps,
  FlashcardsBlock as FlashcardsBlockData,
} from "@/lib/blocks/schema";

/**
 * Flashcards block.
 *
 * One card at a time: clicking the card flips it with a CSS 3D transition and
 * a flip always reveals the back. A card only counts as "reviewed" once its
 * back has been shown, so accidentally clicking through front faces does not
 * unlock the completion button.
 *
 * Keyboard: the card itself is a button, so Space/Enter flip it natively;
 * ArrowRight / ArrowLeft move one card forward or back. Shuffling keeps the
 * review record (it is the same deck, just in another order).
 */

/** Fisher–Yates shuffle; returns a new array so React sees a new reference. */
function shuffled(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i] as number;
    order[i] = order[j] as number;
    order[j] = tmp;
  }

  return order;
}

export function FlashcardsBlock({
  block,
  completed,
  onComplete,
}: BlockRenderProps<FlashcardsBlockData>) {
  const t = useT();
  const { cards } = block.payload;

  const [order, setOrder] = useState<number[]>(() =>
    Array.from({ length: cards.length }, (_, index) => index),
  );
  const [position, setPosition] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  /** Indices (into `cards`) whose back has been revealed at least once. */
  const [reviewed, setReviewed] = useState<number[]>([]);

  const cardIndex = order[position] ?? 0;
  const card = cards[cardIndex];

  const flip = useCallback(() => {
    if (!isFlipped) {
      setReviewed((previous) =>
        previous.includes(cardIndex) ? previous : [...previous, cardIndex],
      );
    }
    setIsFlipped(!isFlipped);
  }, [cardIndex, isFlipped]);

  function move(step: number): void {
    const target = position + step;
    if (target < 0 || target >= order.length) {
      return;
    }
    setPosition(target);
    setIsFlipped(false);
  }

  const allReviewed = reviewed.length === cards.length;

  if (card === undefined) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress
          aria-label={t("block.flashcards.progress")}
          className="flex-1 items-center gap-2"
          value={(reviewed.length / cards.length) * 100}
        >
          <ProgressValue />
        </Progress>
        <span className="text-xs text-nowrap text-muted-foreground tabular-nums">
          {t("block.flashcards.reviewedCount", {
            reviewed: reviewed.length,
            total: cards.length,
          })}
        </span>
      </div>

      <button
        aria-label={
          isFlipped
            ? t("block.flashcards.showQuestion")
            : t("block.flashcards.showAnswer")
        }
        className="block w-full cursor-pointer rounded-xl text-left [perspective:1200px] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={flip}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
        }}
        type="button"
      >
        <div
          className={
            isFlipped
              ? "relative h-56 w-full transition-transform duration-500 [transform-style:preserve-3d] [transform:rotateY(180deg)]"
              : "relative h-56 w-full transition-transform duration-500 [transform-style:preserve-3d]"
          }
        >
          <span className="absolute inset-0 flex flex-col justify-between rounded-xl bg-muted/60 px-5 py-4 ring-1 ring-foreground/10 [backface-visibility:hidden]">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("block.flashcards.front")}
            </span>
            <span className="text-base leading-relaxed font-medium">
              {card.front}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("block.flashcards.hintFront")}
            </span>
          </span>

          <span className="absolute inset-0 flex flex-col justify-between rounded-xl bg-primary/10 px-5 py-4 ring-1 ring-primary/20 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("block.flashcards.back")}
            </span>
            <span className="overflow-y-auto text-sm leading-relaxed">
              {card.back}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("block.flashcards.hintBack")}
            </span>
          </span>
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          aria-label={t("block.flashcards.previous")}
          disabled={position === 0}
          onClick={() => {
            move(-1);
          }}
          size="icon"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>

        <span className="text-xs text-muted-foreground tabular-nums">
          {t("block.flashcards.position", {
            current: position + 1,
            total: order.length,
          })}
        </span>

        <Button
          aria-label={t("block.flashcards.next")}
          disabled={position === order.length - 1}
          onClick={() => {
            move(1);
          }}
          size="icon"
          variant="outline"
        >
          <ChevronRight aria-hidden="true" />
        </Button>

        <Button
          className="ml-auto"
          onClick={() => {
            setOrder(shuffled(cards.length));
            setPosition(0);
            setIsFlipped(false);
          }}
          variant="ghost"
        >
          <Shuffle aria-hidden="true" />
          {t("block.flashcards.shuffle")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          disabled={!allReviewed || completed}
          onClick={() => {
            onComplete(block.id);
          }}
          variant={completed ? "secondary" : "default"}
        >
          {completed ? (
            <>
              <Check aria-hidden="true" />
              {t("block.flashcards.reviewed")}
            </>
          ) : (
            t("block.flashcards.markReviewed")
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          {allReviewed
            ? t("block.flashcards.allDone")
            : t("block.flashcards.remaining", {
                count: cards.length - reviewed.length,
              })}
        </span>
      </div>
    </div>
  );
}
