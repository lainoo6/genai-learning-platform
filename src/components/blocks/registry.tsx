import type { ComponentType } from "react";

import type {
  BlockOfType,
  BlockRenderProps,
  BlockType,
} from "@/lib/blocks/schema";
import { CodingBlock } from "./CodingBlock";
import { FlashcardsBlock } from "./FlashcardsBlock";
import { GameBlock } from "./GameBlock";
import { QuizBlock } from "./QuizBlock";
import { ReadingBlock } from "./ReadingBlock";
import { ReflectionBlock } from "./ReflectionBlock";
import { SlidesBlock } from "./SlidesBlock";

/**
 * Block type → component map. Adding a block means three edits: the Zod schema,
 * the component, and one entry here.
 */
type BlockComponent<T extends BlockType> = ComponentType<
  BlockRenderProps<BlockOfType<T>>
>;

export const blockRegistry: { [T in BlockType]: BlockComponent<T> } = {
  reading: ReadingBlock,
  quiz: QuizBlock,
  flashcards: FlashcardsBlock,
  reflection: ReflectionBlock,
  slides: SlidesBlock,
  coding: CodingBlock,
  game: GameBlock,
};
