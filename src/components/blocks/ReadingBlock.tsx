"use client";

import { Check } from "lucide-react";

import { MarkdownView } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type {
  BlockRenderProps,
  ReadingBlock as ReadingBlockData,
} from "@/lib/blocks/schema";

/** Reading block: markdown (plus an optional illustration) and a read receipt. */
export function ReadingBlock({
  block,
  completed,
  onComplete,
}: BlockRenderProps<ReadingBlockData>) {
  const t = useT();
  const imageUrl = block.payload.imageUrl;

  return (
    <div>
      {imageUrl === undefined ? null : (
        /* eslint-disable-next-line @next/next/no-img-element -- block images are arbitrary author-supplied URLs */
        <img
          alt=""
          className="mb-4 max-h-64 w-full rounded-lg object-cover"
          src={imageUrl}
        />
      )}

      <MarkdownView>{block.payload.markdown}</MarkdownView>

      <div className="mt-6 flex items-center gap-3">
        <Button
          disabled={completed}
          onClick={() => {
            onComplete(block.id);
          }}
          variant={completed ? "secondary" : "default"}
        >
          {completed ? (
            <>
              <Check aria-hidden="true" />
              {t("block.reading.marked")}
            </>
          ) : (
            t("block.reading.mark")
          )}
        </Button>
        {completed ? (
          <span className="text-xs text-muted-foreground">
            {t("block.reading.saved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
