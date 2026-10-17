"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentType, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import type { Block, BlockRenderProps } from "@/lib/blocks/schema";
import { completeBlock } from "@/server/progress";
import { blockRegistry } from "./registry";

export type BlockRendererProps = {
  block: Block;
  courseId: string;
  lessonId: string;
  /** Whether this block is already recorded in the learner's lesson progress. */
  completed?: boolean;
  /**
   * Called when the learner satisfies the block. Defaults to the
   * `completeBlock` server action, so a page can render blocks without wiring
   * its own handler.
   */
  onComplete?: (blockId: string, score?: number) => void;
};

/**
 * Renders one block through the registry and owns the shared chrome: title,
 * type badge, completion tick and save errors.
 */
export function BlockRenderer(props: BlockRendererProps) {
  const { block, courseId, lessonId, completed = false, onComplete } = props;
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleComplete: BlockRenderProps["onComplete"] =
    onComplete
    ?? ((blockId, score) => {
      startTransition(async () => {
        const result = await completeBlock(lessonId, blockId, score);
        if (result.ok) {
          setError(null);
          router.refresh();
          return;
        }
        setError(result.error);
      });
    });

  // The registry is keyed by `block.type`, so TypeScript cannot narrow the union
  // of component types by itself; the mapping guarantees the props line up.
  const Component = blockRegistry[block.type] as unknown as ComponentType<
    BlockRenderProps<Block>
  >;

  return (
    <section className="rounded-xl ring-1 ring-foreground/10">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">{block.title}</h2>
        <Badge variant="secondary">{block.type}</Badge>
        {completed ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
            <Check aria-hidden="true" className="size-3.5" />
            Done
          </span>
        ) : null}
      </header>

      <div className="px-4 py-4">
        <Component
          block={block}
          completed={completed}
          context={{ courseId, lessonId }}
          onComplete={handleComplete}
        />
      </div>

      {isPending ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">Saving progress…</p>
      ) : null}
      {error === null ? null : (
        <p className="px-4 pb-3 text-xs text-red-600">{error}</p>
      )}
    </section>
  );
}
