import type { Block } from "@/lib/blocks/schema";

/**
 * Per-learner rewrites of block content (P4.4).
 *
 * "Explain for me" can save its rewritten body as a `UserBlockOverride`, so the
 * learner keeps reading their personalised version on later visits while the
 * lesson payload — shared by everyone else — stays untouched.
 */

/** One override row: the block it replaces and the markdown to show instead. */
export type BlockOverride = {
  blockId: string;
  markdown: string;
};

/** Only reading blocks have a body that can be swapped out. */
export function canOverrideBlock(block: Block): boolean {
  return block.type === "reading";
}

/**
 * Replaces the markdown of every reading block the learner personalised.
 *
 * Other block types are returned untouched, so a quiz can never be rewritten
 * into a different answer key.
 */
export function applyBlockOverrides(
  blocks: Block[],
  overrides: BlockOverride[],
): Block[] {
  if (overrides.length === 0) {
    return blocks;
  }

  const byBlockId = new Map(
    overrides.map((override) => [override.blockId, override.markdown]),
  );

  return blocks.map((block) => {
    if (!canOverrideBlock(block) || block.type !== "reading") {
      return block;
    }

    const markdown = byBlockId.get(block.id);
    if (markdown === undefined) {
      return block;
    }

    return { ...block, payload: { ...block.payload, markdown } };
  });
}
