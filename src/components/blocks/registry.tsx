import type { ComponentType } from "react";

import type {
  BlockOfType,
  BlockRenderProps,
  BlockType,
} from "@/lib/blocks/schema";
import { QuizBlock } from "./QuizBlock";
import { ReadingBlock } from "./ReadingBlock";

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
};
