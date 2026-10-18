"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/**
 * Share of completed blocks per block type (P5.3).
 *
 * This is the chart that answers "are the interactive activities actually being
 * used?". Counts come from `LessonProgress.completedBlocks`, so each learner
 * contributes at most one per block. The legend is rendered outside recharts so
 * it can show the absolute count and the share next to the colour, which the
 * default legend cannot.
 */

export type BlockMixSliceView = {
  type: string;
  label: string;
  count: number;
};

const SLICE_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#4f46e5",
  "#64748b",
];

const GRID_STROKE = "#e5e7eb";

function sliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length] ?? "#64748b";
}

export function BlockMixChart({ data }: { data: BlockMixSliceView[] }) {
  const total = data.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <div className="space-y-2">
      <div className="h-52 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              innerRadius={54}
              isAnimationActive={false}
              nameKey="label"
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((slice, index) => (
                <Cell fill={sliceColor(index)} key={slice.type} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${GRID_STROKE}`,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {data.map((slice, index) => (
          <li className="flex items-center gap-2 text-xs" key={slice.type}>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: sliceColor(index) }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {slice.label}
            </span>
            <span className="tabular-nums">{slice.count}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">
              {total === 0 ? "0%" : `${Math.round((slice.count / total) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
