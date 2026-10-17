import type { Block } from "@/lib/blocks/schema";

/**
 * Plain-text digests of block content.
 *
 * The AI features (tutor, "Explain for me") need to tell the model what the
 * learner is looking at, but never the whole payload: a trimmed digest keeps the
 * prompt small, cheap and predictable, and avoids leaking answer keys into a
 * summary shown in the UI.
 */

const DEFAULT_DIGEST_LENGTH = 200;

/** The text a learner actually reads for each block type. */
function blockText(block: Block): string {
  switch (block.type) {
    case "reading":
      return block.payload.markdown;
    case "quiz":
      return block.payload.questions
        .map((question) => `${question.prompt} ${question.explanation}`)
        .join(" ");
    case "flashcards":
      return block.payload.cards
        .map((card) => `${card.front} ${card.back}`)
        .join(" ");
    case "reflection":
      return block.payload.prompt;
    case "slides":
      return block.payload.slides
        .map((slide) => `${slide.title} ${slide.bullets.join(" ")} ${slide.narration}`)
        .join(" ");
    case "coding":
      return `${block.payload.problem} ${block.payload.hints.join(" ")}`;
    case "game":
      return block.payload.variant === "sort"
        ? block.payload.items.map((item) => item.text).join(" ")
        : block.payload.pairs
            .map((pair) => `${pair.left} ${pair.right}`)
            .join(" ");
    case "simulation":
      return `${block.payload.intro} ${block.payload.nodes[block.payload.start]?.text ?? ""}`;
  }
}

/**
 * Type, title and the first `maxLength` characters of a block's content,
 * collapsed into one line.
 */
export function blockDigest(
  block: Block,
  maxLength: number = DEFAULT_DIGEST_LENGTH,
): string {
  const text = blockText(block).replace(/\s+/gu, " ").trim();
  const clipped =
    text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`;

  return `${block.type} · ${block.title} · ${clipped}`;
}
