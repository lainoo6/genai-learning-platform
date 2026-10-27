"use client";

import { Trash2, TriangleAlert } from "lucide-react";

import { useState } from "react";
import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { blockSchema } from "@/lib/blocks/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
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
  const t = useT();
  const [previewing, setPreviewing] = useState(false);

  if (block === null) {
    return (
      <aside className="self-start rounded-xl p-4 ring-1 ring-foreground/10">
        <p className="text-sm font-medium">{t("editor.blockEditor.nothing")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("editor.blockEditor.nothingHint")}
        </p>
      </aside>
    );
  }

  const meta = blockMetaFor(block.type);

  return (
    <aside className="space-y-3 self-start rounded-xl p-3 ring-1 ring-foreground/10 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("editor.blockEditor.title")}
        </p>
        <Badge variant="outline">{t(meta.labelKey)}</Badge>
      </div>

      {errors.length === 0 ? null : (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-700">
          <p className="flex items-center gap-1 font-medium">
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            {t("editor.blockEditor.invalid")}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <Input
        aria-label={t("editor.blockEditor.titleAria")}
        onChange={(event) => {
          onChange({ ...block, title: event.target.value });
        }}
        placeholder={t("editor.blockEditor.titlePlaceholder")}
        value={block.title}
      />

      <BlockForm
        block={block}
        key={block.id}
        onChange={onChange}
        onProblem={onProblem}
      />

      <Button
        size="sm"
        variant="outline"
        onClick={() => setPreviewing((v) => !v)}
      >
        {t("activity.preview")}
      </Button>
      {previewing ? (
        blockSchema.safeParse(block).success ? (
          <BlockRenderer
            key={JSON.stringify(block)}
            block={block}
            courseId="preview"
            lessonId="preview"
            preview
          />
        ) : (
          <p className="text-xs text-destructive">
            {t("activity.previewInvalid")}
          </p>
        )
      ) : null}
      <div className="border-t pt-2">
        <Button onClick={onDelete} size="sm" variant="ghost">
          <Trash2 aria-hidden="true" />
          {t("editor.blockEditor.delete")}
        </Button>
      </div>
    </aside>
  );
}
