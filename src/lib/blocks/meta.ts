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
 */
export type BlockMeta = {
  /** Short label shown next to the icon. */
  label: string;
  icon: LucideIcon;
};

export const BLOCK_META: Record<string, BlockMeta> = {
  reading: { label: "Reading", icon: BookText },
  quiz: { label: "Quiz", icon: ListChecks },
  flashcards: { label: "Flashcards", icon: Layers },
  reflection: { label: "Reflection", icon: NotebookPen },
  slides: { label: "Slides", icon: Presentation },
  coding: { label: "Coding", icon: SquareTerminal },
  game: { label: "Game", icon: Gamepad2 },
  simulation: { label: "Simulation", icon: GitBranch },
  roleplay: { label: "Role play", icon: MessagesSquare },
};

const UNKNOWN_BLOCK_META: BlockMeta = { label: "Activity", icon: Sparkles };

export function blockMetaFor(type: string): BlockMeta {
  return BLOCK_META[type] ?? UNKNOWN_BLOCK_META;
}
