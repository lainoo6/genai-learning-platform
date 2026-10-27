"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Daily-active line shared by the teacher insights page (P5.3) and the admin
 * overview (P5.4).
 *
 * Recharts has to run in the browser, so the component is a client island: the
 * server hands it a plain array and nothing else. Colours are explicit instead
 * of `--chart-*` because the shadcn defaults are greyscale and a one-series
 * line needs to stand out from its grid.
 */

export type ActivityLinePoint = {
  date: string;
  active: number;
};

const GRID_STROKE = "#e5e7eb";
const AXIS_TICK = { fontSize: 11, fill: "#6b7280" } as const;

/** `2026-10-18` → `10-18`; the year is the same across the window. */
function shortDate(value: string): string {
  return value.slice(5);
}

export function ActivityLineChart({
  data,
  seriesLabel,
}: {
  data: ActivityLinePoint[];
  seriesLabel: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
          <CartesianGrid
            stroke={GRID_STROKE}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            axisLine={{ stroke: GRID_STROKE }}
            dataKey="date"
            interval="preserveStartEnd"
            minTickGap={24}
            tick={AXIS_TICK}
            tickFormatter={shortDate}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${GRID_STROKE}`,
              fontSize: 12,
            }}
          />
          <Line
            dataKey="active"
            // Dots stay visible because the window is often mostly zeros: a
            // single active day would otherwise draw no line at all.
            dot={{ r: 2, fill: "#2563eb", strokeWidth: 0 }}
            isAnimationActive={false}
            name={seriesLabel}
            stroke="#2563eb"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
