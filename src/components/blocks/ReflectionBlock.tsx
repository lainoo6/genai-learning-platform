"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  BlockRenderProps,
  ReflectionBlock as ReflectionBlockData,
} from "@/lib/blocks/schema";

/**
 * Reflection block: a free-text note with a minimum length.
 *
 * The answer is not graded — reaching `minWords` is what unlocks the completion
 * button. The text itself stays local (nothing to score or persist beyond the
 * completion record); AI feedback on top of it is an AI-phase feature.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

export function ReflectionBlock({
  block,
  completed,
  onComplete,
}: BlockRenderProps<ReflectionBlockData>) {
  const { prompt, minWords } = block.payload;

  const [text, setText] = useState("");
  const words = countWords(text);
  const canComplete = words >= minWords;

  return (
    <div className="space-y-4">
      <p className="text-sm">{prompt}</p>

      <Textarea
        className="min-h-32"
        onChange={(event) => {
          setText(event.target.value);
        }}
        placeholder="Write your answer here…"
        rows={6}
        value={text}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!canComplete || completed}
          onClick={() => {
            onComplete(block.id);
          }}
          variant={completed ? "secondary" : "default"}
        >
          {completed ? (
            <>
              <Check aria-hidden="true" />
              Saved
            </>
          ) : (
            "Save reflection"
          )}
        </Button>

        <p className="text-xs text-muted-foreground tabular-nums">
          {words} / {minWords} words
          {canComplete
            ? ""
            : ` · write ${minWords - words} more to finish this block`}
        </p>
      </div>
    </div>
  );
}
