"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentType, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/client";
import type { Block, BlockRenderProps } from "@/lib/blocks/schema";
import { AttemptHistory } from "./attempt-history";
import { submitActivity } from "@/server/activities";
import type { ActivitySubmission } from "@/lib/blocks/activity-result";
import { completeBlock } from "@/server/progress";
import { BlockExplainer } from "./block-explainer";
import { blockRegistry } from "./registry";

export type BlockRendererProps = {
  block: Block;
  courseId: string;
  lessonId: string;
  /** Whether this block is already recorded in the learner's lesson progress. */
  preview?: boolean;
  completed?: boolean;
  /** Whether the learner replaced this block's content (P4.4 override). */
  overridden?: boolean;
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
  const {
    block,
    courseId,
    lessonId,
    completed = false,
    overridden = false,
    onComplete,
    preview = false,
  } = props;
  const t = useT();
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /**
   * Preview never writes progress, but the block still has to acknowledge the
   * click: a teacher who marks a block done sees the tick, not a dead button.
   */
  const [previewCompleted, setPreviewCompleted] = useState(false);
  const isCompleted = completed || previewCompleted;

  const [savingCount, setSavingCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState<
    Array<ActivitySubmission & { attemptId: string }>
  >([]);
  const queue = useRef(Promise.resolve());
  function handleAttempt(input: ActivitySubmission) {
    if (preview) return;
    setSavingCount((n) => n + 1);
    const submission = {
      ...input,
      attemptId: input.attemptId ?? crypto.randomUUID(),
    };
    queue.current = queue.current.then(async () => {
      const result = await submitActivity(
        lessonId,
        block.id,
        submission,
        preview,
      ).catch(() => ({ ok: false as const, error: t("activity.saveFailed") }));
      if (!result.ok) {
        setError(result.error);
        setFailed((prev) =>
          prev.some((p) => p.attemptId === submission.attemptId)
            ? prev
            : [...prev, submission],
        );
      } else {
        setError(null);
        setFailed((prev) =>
          prev.filter((p) => p.attemptId !== submission.attemptId),
        );
        setRevision((v) => v + 1);
        router.refresh();
      }
      setSavingCount((n) => n - 1);
    });
  }
  const handleComplete: BlockRenderProps["onComplete"] = (blockId, score) => {
    if (preview) {
      setPreviewCompleted(true);
      return;
    }

    if (onComplete) {
      onComplete(blockId, score);
      return;
    }

    startTransition(async () => {
      await queue.current;
      const result = await completeBlock(lessonId, blockId, score, false);
      if (result.ok) {
        setError(null);
        router.refresh();
        return;
      }
      setError(result.error);
    });
  };

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
        {overridden ? (
          <Badge variant="outline">{t("block.renderer.personalised")}</Badge>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {isCompleted ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check aria-hidden="true" className="size-3.5" />
              {t("block.renderer.done")}
            </span>
          ) : null}
          {preview && previewCompleted ? (
            <span className="text-xs text-muted-foreground">
              {t("block.renderer.previewNotSaved")}
            </span>
          ) : null}
          {preview ? null : (
            <BlockExplainer
              blockId={block.id}
              canReplace={block.type === "reading"}
              lessonId={lessonId}
              replaced={overridden}
            />
          )}
        </span>
      </header>

      <div className="px-4 py-4">
        <Component
          block={block}
          completed={isCompleted}
          context={{ courseId, lessonId, preview }}
          onAttempt={handleAttempt}
          onComplete={handleComplete}
        />
      </div>

      {preview ? null : (
        <AttemptHistory
          blockId={block.id}
          lessonId={lessonId}
          key={`${block.id}-${revision}`}
        />
      )}
      {failed.length ? (
        <button
          type="button"
          className="m-4 rounded border px-3 py-2 text-sm"
          onClick={() => {
            setError(null);
            failed.forEach(handleAttempt);
          }}
        >
          {t("activity.retrySave")}
        </button>
      ) : null}
      {isPending || savingCount > 0 ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          {t("block.renderer.saving")}
        </p>
      ) : null}
      {error === null ? null : (
        <p className="px-4 pb-3 text-xs text-red-600">{error}</p>
      )}
    </section>
  );
}
