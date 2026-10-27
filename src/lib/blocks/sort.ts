import type { SortItem } from "./schema";

export type SortRow = SortItem & {
  id: number;
  locked: boolean;
};

export function moveSortRow(
  rows: readonly SortRow[],
  index: number,
  direction: -1 | 1,
): SortRow[] {
  const movable = rows
    .map((row, position) => (row.locked ? -1 : position))
    .filter((position) => position >= 0);
  const slot = movable.indexOf(index);
  const target = movable[slot + direction];
  if (slot < 0 || target === undefined) {
    return [...rows];
  }

  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
