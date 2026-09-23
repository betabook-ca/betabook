"use client";
import { useState } from "react";
import { ReferenceLine, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartInspection, ChartHitRegions } from "@/components/chart-inspection";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useChartWidth } from "@/hooks/use-chart-width";
import {
  sendChartRows,
  groupDatedRows,
  type ChartClimbRow,
  type ChartSend,
  type ChartDetailGroup,
} from "@/lib/chart-details";
import { formatCount } from "@/lib/format";
import { formatMonth } from "@/lib/format-date";
import type { ClimbType } from "@/lib/grades";
import type { MonthlyVolume } from "@/lib/user-analytics";

export function AnalyticsVolumeChart({
  rows,
  type,
  journalVisible = false,
  sends,
  activities,
}: {
  rows: MonthlyVolume[];
  type: ClimbType;
  journalVisible?: boolean;
  /** Already scoped to `type`. */
  sends?: ChartSend[];
  activities?: ChartClimbRow[];
}) {
  const [metric, setMetric] = useState<"sends" | "days">("sends");
  const label = metric === "sends" ? "Sends" : "Days out";
  const { ref, width } = useChartWidth();
  const labels = rows.map(
    (row) => `${formatMonth(row.month)}: ${row[metric]} ${label.toLowerCase()}`,
  );
  const detailRows = metric === "sends" ? sends && sendChartRows(sends) : activities;
  const rowsByMonth = groupDatedRows(detailRows ?? [], (entry) => entry.date, "month");
  const details =
    detailRows &&
    Object.fromEntries(
      rows.map((row, i) => {
        const matches = rowsByMonth.get(row.month) ?? [];
        return [
          labels[i],
          {
            title: formatMonth(row.month),
            rows: matches,
            summary:
              metric === "sends" ? formatCount(row.sends, "send") : formatCount(row.days, "day"),
          } satisfies ChartDetailGroup,
        ];
      }),
    );
  return (
    <div className="min-w-0" ref={ref}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Volume over time</Eyebrow>
          <p className="text-xs text-muted">
            {metric === "sends"
              ? "Dated sends each month."
              : journalVisible
                ? "Distinct days with logged climbing sessions each month."
                : "Days with a dated send each month; private journal sessions aren’t included."}
          </p>
        </div>
        <div role="group" aria-label="Volume metric" className="flex gap-2">
          {(["sends", "days"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={metric === value}
              className={choicePillClass(metric === value, "bg-accent text-accent-foreground")}
              onClick={() => setMetric(value)}
            >
              {value === "sends" ? "Sends" : "Days out"}
            </button>
          ))}
        </div>
      </div>
      {rows.length ? (
        <ChartInspection key={metric} label={`Monthly ${label.toLowerCase()}`} details={details}>
          <div className="relative">
            <LineChart
              width={width}
              height={240}
              data={rows}
              margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--separator)" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                minTickGap={40}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                width={32}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Line
                type="monotone"
                dataKey={metric}
                stroke={DISCIPLINE_HUE[type]}
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              {rows.length === 1 && (
                <ReferenceLine
                  y={rows[0][metric]}
                  stroke={DISCIPLINE_HUE[type]}
                  strokeWidth={2.5}
                />
              )}
            </LineChart>
            <ChartHitRegions labels={labels} endpointHalf />
          </div>
        </ChartInspection>
      ) : (
        <p className="text-sm text-muted">No dated activity.</p>
      )}
    </div>
  );
}
