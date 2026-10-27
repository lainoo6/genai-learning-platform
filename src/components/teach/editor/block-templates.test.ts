import { describe, expect, it } from "vitest";

import { createBlock } from "./block-templates";
import { blockSchema } from "@/lib/blocks/schema";

describe("game activity template", () => {
  it("creates a schema-valid five-challenge sort activity", () => {
    const block = createBlock("game");

    expect(block.type).toBe("game");
    expect(block.payload).toMatchObject({
      variant: "sort",
      items: [
        { text: "First step", order: 0 },
        { text: "Second step", order: 1 },
        { text: "Third step", order: 2 },
        { text: "Fourth step", order: 3 },
        { text: "Fifth step", order: 4 },
      ],
    });
    expect(blockSchema.safeParse(block).success).toBe(true);
  });

  it("uses the same five-challenge contract for the Chinese template", () => {
    const block = createBlock("game", "zh");

    expect(block.type).toBe("game");
    if (block.type === "game" && block.payload.variant === "sort") {
      expect(block.payload.items).toHaveLength(5);
      expect(block.payload.items.map((item) => item.order)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    } else {
      throw new Error("Expected a sort game template.");
    }
    expect(blockSchema.safeParse(block).success).toBe(true);
  });
});
