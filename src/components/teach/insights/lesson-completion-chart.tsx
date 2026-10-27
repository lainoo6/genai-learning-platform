"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Completion count per lesson (P5.3).
 *
 * Horizontal bars: lesson titles are sentences, so the category axis needs the
 * room a vertical layout cannot give it. The canvas grows with the number of
 * lessons instead of squeezing them into a fixed height.
 */

export type LessonCompletionBar = {
  lessonId: string;
  title: string;
  completed: number;
  total: number;
};

const GRID_STROKE = "#e5e7eb";
const AXIS_TICK = { fontSize: 11, fill: "#6b7280" } as const;
const TITLE_MAX = 34;

function truncate(value: string): string {
  return value.length > TITLE_MAX ? `${value.slice(0, TITLE_MAX - 1)}…` : value;
}

export function LessonCompletionChart({
  data,
  seriesLabel,
}: {
  data: LessonCompletionBar[];
  seriesLabel: string;
}) {
  return (
    <div
      className="w-full"
      style={{ height: Math.max(200, data.length * 38 + 24) }}
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke={GRID_STROKE}
            strokeDasharray="3 3"
          />
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="title"
            tick={AXIS_TICK}
            tickFormatter={truncate}
            tickLine={false}
            type="category"
            width={190}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${GRID_STROKE}`,
              fontSize: 12,
            }}
            cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
          />
          <Bar
            dataKey="completed"
            fill="#2563eb"
            isAnimationActive={false}
            name={seriesLabel}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
