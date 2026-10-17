"use client";

import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MarkdownView } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  clearBlockOverride,
  explainBlock,
  saveBlockOverride,
} from "@/server/personalize";

/**
 * "Explain for me" (P4.4).
 *
 * Every block header gets this menu. It asks the server for a rewrite of the
 * block for this learner, shows it in a dialog, and — for reading blocks — can
 * save it as a per-user override so the personalised body replaces the authored
 * one on every later visit. Saving is reversible from the same menu.
 */

export type BlockExplainerProps = {
  lessonId: string;
  blockId: string;
  /** Only reading blocks have a body that can be replaced. */
  canReplace: boolean;
  /** Whether this learner already replaced the block content. */
  replaced: boolean;
};

type Explanation = {
  title: string;
  markdown: string;
};

export function BlockExplainer({
  lessonId,
  blockId,
  canReplace,
  replaced,
}: BlockExplainerProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReplaced, setIsReplaced] = useState(replaced);
  const [isPending, startTransition] = useTransition();

  function request(): void {
    setOpen(true);
    setExplanation(null);
    setError(null);

    startTransition(async () => {
      const result = await explainBlock(lessonId, blockId);
      if (result.ok) {
        setExplanation({ title: result.title, markdown: result.markdown });
        return;
      }
      setError(result.error);
    });
  }

  function toggleReplace(next: boolean): void {
    if (!canReplace || explanation === null) {
      return;
    }

    startTransition(async () => {
      const result = next
        ? await saveBlockOverride(lessonId, blockId, explanation.markdown)
        : await clearBlockOverride(lessonId, blockId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setIsReplaced(next);
      router.refresh();
    });
  }

  function restore(): void {
    startTransition(async () => {
      const result = await clearBlockOverride(lessonId, blockId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setIsReplaced(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Block options"
          render={<Button size="icon-sm" variant="ghost" />}
        >
          <Sparkles aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={request}>
            <Sparkles aria-hidden="true" />
            Explain for me
          </DropdownMenuItem>
          {isReplaced ? (
            <DropdownMenuItem onClick={restore}>
              <Undo2 aria-hidden="true" />
              Restore original text
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        onOpenChange={(next) => {
          setOpen(next);
        }}
        open={open}
      >
        <DialogContent className="max-h-[85vh] w-full overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {explanation === null ? "Explaining this block…" : explanation.title}
            </DialogTitle>
            <DialogDescription>
              Rewritten for your profile. Nothing is changed until you switch on
              “Replace content”.
            </DialogDescription>
          </DialogHeader>

          {explanation === null ? (
            <p className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {isPending ? "Asking the tutor…" : "Nothing to show."}
            </p>
          ) : (
            <MarkdownView>{explanation.markdown}</MarkdownView>
          )}

          {canReplace && explanation !== null ? (
            <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
              <Checkbox
                checked={isReplaced}
                disabled={isPending}
                onCheckedChange={(checked) => {
                  toggleReplace(checked);
                }}
              />
              <span className="text-sm">
                Replace content
                <span className="block text-xs text-muted-foreground">
                  Only you see this version. You can restore the original at any
                  time.
                </span>
              </span>
            </label>
          ) : null}

          {error === null ? null : (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
