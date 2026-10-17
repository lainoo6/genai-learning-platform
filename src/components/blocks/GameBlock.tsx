"use client";

import type {
  BlockRenderProps,
  GameBlock as GameBlockData,
} from "@/lib/blocks/schema";
import { trackBlockEvent } from "@/server/progress";
import { MatchGame } from "./MatchGame";
import { SortGame } from "./SortGame";

/**
 * Game block: a thin dispatcher over the two mini-games.
 *
 * It owns the two things the games should not know about — which lesson they
 * belong to and how a finished run is recorded — and hands the puzzle itself
 * down as plain data.
 */
export function GameBlock({
  block,
  completed,
  context,
  onComplete,
}: BlockRenderProps<GameBlockData>) {
  const { payload } = block;

  function handleFinish(stats: Record<string, unknown>): void {
    void trackBlockEvent(context.lessonId, block.id, "GAME_FINISH", stats);
  }

  if (payload.variant === "sort") {
    return (
      <SortGame
        completed={completed}
        items={payload.items}
        onComplete={() => {
          onComplete(block.id);
        }}
        onFinish={handleFinish}
      />
    );
  }

  return (
    <MatchGame
      completed={completed}
      onComplete={() => {
        onComplete(block.id);
      }}
      onFinish={handleFinish}
      pairs={payload.pairs}
    />
  );
}
