import { describe, expect, it } from "vitest";

import { blockListSchema, blockSchema } from "./schema";

const validReading = {
  id: "blk_reading",
  title: "What Is GenAI?",
  type: "reading",
  payload: {
    markdown: "# Hello\n\nSome **markdown**.",
  },
};

describe("blockSchema", () => {
  it("accepts a reading block without an image", () => {
    expect(blockSchema.safeParse(validReading).success).toBe(true);
  });

  it("accepts a reading block with an image", () => {
    const result = blockSchema.safeParse({
      ...validReading,
      payload: { markdown: "text", imageUrl: "/cover.svg" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a reading block with an empty markdown payload", () => {
    const result = blockSchema.safeParse({
      ...validReading,
      payload: { markdown: "" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown block type", () => {
    const result = blockSchema.safeParse({ ...validReading, type: "slides" });

    expect(result.success).toBe(false);
  });

  it("rejects a block without an id", () => {
    const result = blockSchema.safeParse({ ...validReading, id: "" });

    expect(result.success).toBe(false);
  });

  it("rejects raw JSON that is not an object", () => {
    expect(blockSchema.safeParse("reading").success).toBe(false);
    expect(blockSchema.safeParse(null).success).toBe(false);
  });
});

describe("blockListSchema", () => {
  it("accepts a lesson block list", () => {
    expect(blockListSchema.safeParse([validReading]).success).toBe(true);
  });

  it("rejects a list containing one invalid block", () => {
    const result = blockListSchema.safeParse([validReading, { id: "x" }]);

    expect(result.success).toBe(false);
  });

  it("rejects a non-array value", () => {
    expect(blockListSchema.safeParse({ blocks: [] }).success).toBe(false);
  });
});
