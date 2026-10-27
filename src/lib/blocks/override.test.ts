import { describe, expect, it } from "vitest";

import { applyBlockOverrides, canOverrideBlock } from "@/lib/blocks/override";
import { blockListSchema, type Block } from "@/lib/blocks/schema";

const reading: Block = {
  id: "b1",
  title: "Reading",
  type: "reading",
  payload: { markdown: "# Original" },
};

const quiz: Block = {
  id: "b2",
  title: "Quiz",
  type: "quiz",
  payload: {
    passScore: 0.5,
    questions: [
      {
        id: "q1",
        kind: "truefalse",
        prompt: "True?",
        explanation: "Because.",
        answer: [0],
      },
    ],
  },
};

describe("canOverrideBlock", () => {
  it("only allows reading blocks to be rewritten", () => {
    expect(canOverrideBlock(reading)).toBe(true);
    expect(canOverrideBlock(quiz)).toBe(false);
  });
});

describe("applyBlockOverrides", () => {
  it("returns the blocks untouched when there is no override", () => {
    const blocks = blockListSchema.parse([reading, quiz]);

    expect(applyBlockOverrides(blocks, [])).toBe(blocks);
  });

  it("replaces the markdown of a reading block", () => {
    const result = applyBlockOverrides([reading, quiz], [
      { blockId: "b1", markdown: "# Personalised" },
    ]);

    expect(result[0]).toMatchObject({
      id: "b1",
      payload: { markdown: "# Personalised" },
    });
  });

  it("never rewrites another block type", () => {
    const result = applyBlockOverrides([quiz], [
      { blockId: "b2", markdown: "cheating" },
    ]);

    expect(result[0]).toBe(quiz);
  });

  it("ignores overrides for blocks that are not in the lesson", () => {
    const result = applyBlockOverrides([reading], [
      { blockId: "gone", markdown: "# Personalised" },
    ]);

    expect(result[0]).toBe(reading);
  });
});
