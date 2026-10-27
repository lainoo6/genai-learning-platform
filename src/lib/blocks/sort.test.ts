import { describe, expect, it } from "vitest";

import { moveSortRow } from "./sort";
import { reorderSortItems } from "@/components/teach/editor/block-templates";

describe("sort challenge behavior", () => {
  it("moves a focused row through unlocked positions without moving locked rows", () => {
    const rows = [
      { id: 0, text: "A", order: 0, locked: false },
      { id: 1, text: "B", order: 1, locked: true },
      { id: 2, text: "C", order: 2, locked: false },
      { id: 3, text: "D", order: 3, locked: false },
    ];

    expect(moveSortRow(rows, 3, -1)).toEqual([
      rows[0],
      rows[1],
      rows[3],
      rows[2],
    ]);
    expect(moveSortRow(rows, 1, 1)).toEqual(rows);
  });

  it("reorders editor items and rewrites their canonical positions", () => {
    const items = [
      { text: "First", order: 0 },
      { text: "Second", order: 1 },
      { text: "Third", order: 2 },
    ];

    expect(reorderSortItems(items, 2, -1)).toEqual([
      { text: "First", order: 0 },
      { text: "Third", order: 1 },
      { text: "Second", order: 2 },
    ]);
    expect(reorderSortItems(items, 0, -1)).toEqual(items);
  });
});
