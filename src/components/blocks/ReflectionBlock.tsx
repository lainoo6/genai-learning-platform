"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
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
const CJK_CHARACTER = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g;

/**
 * Length of a reflection, counted the way the language is written: Chinese has
 * no spaces between words, so each CJK character counts as one unit and the
 * remaining text is split on whitespace.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  const cjk = trimmed.match(CJK_CHARACTER)?.length ?? 0;
  const rest = trimmed.replace(CJK_CHARACTER, " ").trim();

  return cjk + (rest.length === 0 ? 0 : rest.split(/\s+/).length);
}

export function ReflectionBlock({
  block,
  completed,
  onComplete,
}: BlockRenderProps<ReflectionBlockData>) {
  const t = useT();
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
        placeholder={t("block.reflection.placeholder")}
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
              {t("block.reflection.saved")}
            </>
          ) : (
            t("block.reflection.save")
          )}
        </Button>

        <p className="text-xs text-muted-foreground tabular-nums">
          {t("block.reflection.words", { words, min: minWords })}
          {canComplete
            ? ""
            : ` · ${t("block.reflection.more", { count: minWords - words })}`}
        </p>
      </div>
    </div>
  );
}
