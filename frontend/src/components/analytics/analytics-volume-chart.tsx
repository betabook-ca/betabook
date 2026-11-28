"use client";
import { useState } from "react";
import { ReferenceLine, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { CHART_TICK } from "@/components/analytics/chart-axis";
import { ChartInspection, ChartHitRegions } from "@/components/analytics/chart-inspection";
import { DISCIPLINE_HUE } from "@/components/climbing/discipline-chip";
import { choicePillClass } from "@/components/ui/choice-pill";
import { ChoicePills } from "@/components/ui/choice-pills";
import { PanelHeader } from "@/components/ui/eyebrow";
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
      <PanelHeader
        title="Volume over time"
        description={
          metric === "sends"
            ? "Dated sends each month."
            : journalVisible
              ? "Distinct days with logged climbing sessions each month."
              : "Days with a dated send each month; private journal sessions aren’t included."
        }
        actions={
          <ChoicePills
            label="Volume metric"
            selectionMode="single"
            value={[metric]}
            onChange={([next]) => {
              if (next !== undefined) setMetric(next);
            }}
            options={[
              { value: "sends", label: "Sends" },
              { value: "days", label: "Days out" },
            ]}
            pillClass={(selected) => choicePillClass(selected, "bg-accent text-accent-foreground")}
            className="flex gap-2"
          />
        }
      />
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
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                width={32}
                tick={CHART_TICK}
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
