"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { blockMetaFor } from "@/lib/blocks/meta";
import type { BlockType } from "@/lib/blocks/schema";
import type { EditorLesson } from "@/lib/teach-editor";
import { cn } from "@/lib/utils";
import { BLOCK_TYPE_INFO } from "./block-templates";

/**
 * Middle column of the course editor (P5.1): the block sequence of one lesson.
 *
 * Reordering, duplicating and deleting all happen in local state, so an
 * accidental delete is undone by reloading the page until the author saves.
 * A block whose payload failed validation keeps its red marker here, which is
 * how the error message stays attached to the thing that caused it.
 */

export type BlockListPanelProps = {
  lesson: EditorLesson | null;
  selectedBlockId: string | null;
  blockIssues: Record<string, string[]>;
  lessonIssues: string[];
  onSelectBlock: (blockId: string) => void;
  onRenameLesson: (title: string) => void;
  onChangeMinutes: (minutes: number) => void;
  onMoveBlock: (index: number, delta: number) => void;
  onDuplicateBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddBlock: (type: BlockType) => void;
};

export function BlockListPanel(props: BlockListPanelProps) {
  const {
    lesson,
    selectedBlockId,
    blockIssues,
    lessonIssues,
    onSelectBlock,
    onRenameLesson,
    onChangeMinutes,
    onMoveBlock,
    onDuplicateBlock,
    onDeleteBlock,
    onAddBlock,
  } = props;

  const [pickerOpen, setPickerOpen] = useState(false);

  if (lesson === null) {
    return (
      <section className="rounded-xl p-4 ring-1 ring-foreground/10">
        <p className="text-sm font-medium">No lesson selected</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a lesson on the left, or add one, to edit its blocks.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 self-start rounded-xl p-3 ring-1 ring-foreground/10">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Lesson content
          </p>
          <Badge variant="secondary">
            {lesson.blocks.length} block{lesson.blocks.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <Input
          aria-label="Lesson title"
          className="h-8 font-medium"
          onChange={(event) => {
            onRenameLesson(event.target.value);
          }}
          placeholder="Lesson title"
          value={lesson.title}
        />

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Estimated
          <Input
            aria-label="Estimated minutes"
            className="h-7 w-16"
            min={1}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              onChangeMinutes(Number.isFinite(minutes) ? Math.trunc(minutes) : 0);
            }}
            type="number"
            value={lesson.estimatedMinutes}
          />
          minutes
        </label>
      </div>

      {lesson.droppedBlocks > 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {lesson.droppedBlocks} stored block
          {lesson.droppedBlocks === 1 ? "" : "s"} no longer match the block
          schema and could not be loaded. Saving this lesson replaces them.
        </p>
      ) : null}

      {lessonIssues.map((issue) => (
        <p
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-700"
          key={issue}
        >
          {issue}
        </p>
      ))}

      {lesson.blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-6 text-center">
          <p className="text-xs font-medium">No blocks yet</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Add a reading, a quiz, or any of the seven other activity types.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {lesson.blocks.map((block, index) => {
            const meta = blockMetaFor(block.type);
            const Icon = meta.icon;
            const isSelected = block.id === selectedBlockId;
            const problems = blockIssues[block.id] ?? [];

            return (
              <li key={block.id}>
                <div
                  className={cn(
                    "rounded-lg px-2 py-1.5 ring-1 transition-colors",
                    isSelected
                      ? "bg-primary/5 ring-primary/50"
                      : "ring-foreground/10 hover:bg-muted/40",
                    problems.length > 0 ? "ring-red-500/60" : "",
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-muted-foreground">
                      <Icon aria-hidden="true" className="size-3.5" />
                    </span>

                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        onSelectBlock(block.id);
                      }}
                      type="button"
                    >
                      <span className="block truncate text-xs font-medium">
                        {block.title.trim().length === 0
                          ? "Untitled block"
                          : block.title}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {meta.label}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center">
                      <Button
                        aria-label={`Move block ${String(index + 1)} up`}
                        disabled={index === 0}
                        onClick={() => {
                          onMoveBlock(index, -1);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`Move block ${String(index + 1)} down`}
                        disabled={index === lesson.blocks.length - 1}
                        onClick={() => {
                          onMoveBlock(index, 1);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`Duplicate block ${String(index + 1)}`}
                        onClick={() => {
                          onDuplicateBlock(block.id);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`Delete block ${String(index + 1)}`}
                        onClick={() => {
                          onDeleteBlock(block.id);
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {problems.length === 0 ? null : (
                    <p className="mt-1 flex items-start gap-1 text-[10px] text-red-600">
                      <TriangleAlert
                        aria-hidden="true"
                        className="mt-0.5 size-3 shrink-0"
                      />
                      {problems[0]}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        className="w-full"
        onClick={() => {
          setPickerOpen(true);
        }}
        variant="outline"
      >
        <Plus aria-hidden="true" />
        Add block
      </Button>

      <Dialog onOpenChange={setPickerOpen} open={pickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a block</DialogTitle>
            <DialogDescription>
              Pick an activity. It is added at the end of “{lesson.title}” and
              can be moved afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5 sm:grid-cols-2">
            {BLOCK_TYPE_INFO.map((info) => {
              const meta = blockMetaFor(info.type);
              const Icon = meta.icon;

              return (
                <button
                  className="flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60"
                  key={info.type}
                  onClick={() => {
                    onAddBlock(info.type);
                    setPickerOpen(false);
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{info.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {info.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
