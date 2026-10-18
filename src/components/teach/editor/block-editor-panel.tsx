"use client";

import { Trash2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blockMetaFor } from "@/lib/blocks/meta";
import type { Block } from "@/lib/blocks/schema";
import { BlockForm } from "./block-form";

/**
 * Right column of the course editor (P5.1): the form of the selected block.
 *
 * The panel is keyed by block id (`BlockForm key` below), so switching blocks
 * resets the form-local state — the reading preview tab, the simulation JSON
 * textarea — instead of carrying one block's draft into another.
 */

export type BlockEditorPanelProps = {
  block: Block | null;
  errors: string[];
  onChange: (next: Block) => void;
  onProblem: (message: string | null) => void;
  onDelete: () => void;
};

export function BlockEditorPanel(props: BlockEditorPanelProps) {
  const { block, errors, onChange, onProblem, onDelete } = props;

  if (block === null) {
    return (
      <aside className="self-start rounded-xl p-4 ring-1 ring-foreground/10">
        <p className="text-sm font-medium">Nothing selected</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a block in the middle column to edit its content.
        </p>
      </aside>
    );
  }

  const meta = blockMetaFor(block.type);

  return (
    <aside className="space-y-3 self-start rounded-xl p-3 ring-1 ring-foreground/10 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Block editor
        </p>
        <Badge variant="outline">{meta.label}</Badge>
      </div>

      {errors.length === 0 ? null : (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-700">
          <p className="flex items-center gap-1 font-medium">
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            This block is not valid yet
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <Input
        aria-label="Block title"
        onChange={(event) => {
          onChange({ ...block, title: event.target.value });
        }}
        placeholder="Block title"
        value={block.title}
      />

      <BlockForm
        block={block}
        key={block.id}
        onChange={onChange}
        onProblem={onProblem}
      />

      <div className="border-t pt-2">
        <Button onClick={onDelete} size="sm" variant="ghost">
          <Trash2 aria-hidden="true" />
          Delete block
        </Button>
      </div>
    </aside>
  );
}
