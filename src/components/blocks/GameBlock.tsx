"use client";

import type {
  BlockRenderProps,
  GameBlock as GameBlockData,
} from "@/lib/blocks/schema";
import { ChooseGame } from "./ChooseGame";
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
  onAttempt,
  onComplete,
}: BlockRenderProps<GameBlockData>) {
  const { payload } = block;

  function handleFinish(stats: Record<string, unknown>): void {
    onAttempt?.({
      answer: stats,
      feedback:
        stats.kind === "hint"
          ? { kind: "hint", playthrough: stats.playthrough }
          : {},
    });
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

  if (payload.variant === "choose") {
    return (
      <ChooseGame
        completed={completed}
        onComplete={() => {
          onComplete(block.id);
        }}
        onFinish={handleFinish}
        options={payload.options}
        prompt={payload.prompt}
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
