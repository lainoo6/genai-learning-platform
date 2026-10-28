"use client";

import { useEffect, useState } from "react";

import type {
  BlockRenderProps,
  GameBlock as GameBlockData,
} from "@/lib/blocks/schema";
import { useT } from "@/i18n/client";
import { loadLatestGamePlaythrough } from "@/server/activities";
import { ChooseGame } from "./ChooseGame";
import { MatchGame } from "./MatchGame";
import { SortGame } from "./SortGame";

export type GameRecovery = {
  attempts: Array<{ answer: Record<string, unknown>; completed: boolean }>;
};

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
  context,
}: BlockRenderProps<GameBlockData>) {
  const { payload } = block;
  const t = useT();
  const [recoveryReady, setRecoveryReady] = useState(context.preview === true);
  const [recovery, setRecovery] = useState<GameRecovery>();

  useEffect(() => {
    if (context.preview) return;
    void loadLatestGamePlaythrough(context.lessonId, block.id).then((result) => {
      if (result.ok && result.attempts.length > 0)
        setRecovery({ attempts: result.attempts });
      setRecoveryReady(true);
    });
  }, [block.id, context.lessonId, context.preview]);

  if (!recoveryReady) {
    return <p className="text-sm text-muted-foreground">{t("block.renderer.saving")}</p>;
  }

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
        recovery={recovery}
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
        recovery={recovery}
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
      recovery={recovery}
    />
  );
}
