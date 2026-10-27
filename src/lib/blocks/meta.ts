import {
  BookText,
  Gamepad2,
  GitBranch,
  Layers,
  ListChecks,
  LucideIcon,
  MessagesSquare,
  NotebookPen,
  Presentation,
  Sparkles,
  SquareTerminal,
} from "lucide-react";

/**
 * Presentation metadata per block type: used by the course outline, the player
 * sidebar and anywhere else the blocks of a lesson have to be summarised
 * without rendering them.
 *
 * The map is keyed by string (not by `BlockType`) because it stays one step
 * ahead of the renderer: outlines must still show an icon for content whose
 * block component lands in a later phase.
 *
 * `labelKey` is a dictionary key rather than a label, so every surface renders
 * the block name in the reader's language.
 */
export type BlockMeta = {
  /** Dictionary key for the short label shown next to the icon. */
  labelKey: string;
  icon: LucideIcon;
};

export const BLOCK_META: Record<string, BlockMeta> = {
  reading: { labelKey: "block.reading", icon: BookText },
  quiz: { labelKey: "block.quiz", icon: ListChecks },
  flashcards: { labelKey: "block.flashcards", icon: Layers },
  reflection: { labelKey: "block.reflection", icon: NotebookPen },
  slides: { labelKey: "block.slides", icon: Presentation },
  coding: { labelKey: "block.coding", icon: SquareTerminal },
  game: { labelKey: "block.game", icon: Gamepad2 },
  simulation: { labelKey: "block.simulation", icon: GitBranch },
  roleplay: { labelKey: "block.roleplay", icon: MessagesSquare },
};

const UNKNOWN_BLOCK_META: BlockMeta = { labelKey: "block.unknown", icon: Sparkles };

export function blockMetaFor(type: string): BlockMeta {
  return BLOCK_META[type] ?? UNKNOWN_BLOCK_META;
}
