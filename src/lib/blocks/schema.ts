import { z } from "zod";

/**
 * Single source of truth for lesson blocks (docs/plan/01 §3).
 *
 * Blocks live in `Lesson.blocks` as plain JSON, so every read path must run the
 * payload through these schemas before rendering. New block type = add a schema
 * here + a component + a registry entry.
 */

/** Common fields shared by every block. */
export const blockBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

/** `reading` — markdown plus an optional illustration shown above the text. */
export const readingBlockSchema = blockBaseSchema.extend({
  type: z.literal("reading"),
  payload: z.object({
    markdown: z.string().min(1),
    /** Absolute URL or a path under `/public`; empty strings are rejected. */
    imageUrl: z.string().min(1).optional(),
  }),
});

/** Discriminated union of every implemented block. */
export const blockSchema = z.discriminatedUnion("type", [readingBlockSchema]);

/** `Lesson.blocks` is stored as a JSON array of blocks. */
export const blockListSchema = z.array(blockSchema);

export type BlockType = z.infer<typeof blockSchema>["type"];
export type Block = z.infer<typeof blockSchema>;
export type ReadingBlock = z.infer<typeof readingBlockSchema>;

export type BlockOfType<T extends BlockType> = Extract<Block, { type: T }>;

/**
 * Props every block component receives through the registry.
 *
 * `onComplete(blockId)` is called once the learner has satisfied the block.
 */
export type BlockRenderProps<T extends Block = Block> = {
  block: T;
  completed: boolean;
  onComplete: (blockId: string) => void;
};
