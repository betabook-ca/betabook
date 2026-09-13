"use client";
import { ReferenceLine, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { ChartInspection, ChartHitRegions } from "@/components/chart-inspection";
import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { AnalyticsSendRow } from "@/db/queries";
import { useChartWidth } from "@/hooks/use-chart-width";
import { sendChartRows, type ChartDetailGroup } from "@/lib/chart-details";
import { formatCount } from "@/lib/format";
import type { ClimbType } from "@/lib/grades";
import type { FirstTryGradeRow } from "@/lib/user-analytics";

/** A rope onsight counts as a flash here, as in the Flash stat. */
export function AnalyticsFlashChart({
  rows,
  type,
  sends,
}: {
  rows: FirstTryGradeRow[];
  type: ClimbType;
  /** Already scoped to `type`. */
  sends?: AnalyticsSendRow[];
}) {
  const { ref, width } = useChartWidth();
  const labels = rows.map(
    (row) =>
      `${row.label}: ${formatCount(row.sends, "send")} · ${formatCount(row.firstTries, "flash", "flashes")} · ${Math.round(row.rate)}% flash rate`,
  );
  const details =
    sends &&
    Object.fromEntries(
      rows.map((row, i) => [
        labels[i],
        {
          title: row.label,
          summary: `${formatCount(row.sends, "send")} · ${Math.round(row.rate)}% flash rate`,
          rows: sendChartRows(sends.filter((send) => send.suggestedGrade === row.grade)),
        } satisfies ChartDetailGroup,
      ]),
    );
  return (
    <div className="min-w-0" ref={ref}>
      <Eyebrow className="mb-4">Flash rate by grade</Eyebrow>
      {rows.length ? (
        <>
          <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-xs"
                style={{ backgroundColor: DISCIPLINE_HUE[type], opacity: 0.7 }}
              />
              Total sends
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 border-t-2 border-foreground" />
              Flash rate
            </span>
          </div>
          <ChartInspection label="Sends and flash percentage by grade" details={details}>
            <div className="relative">
              <ComposedChart
                width={width}
                height={240}
                data={rows}
                margin={{ top: 16, right: 0, bottom: 8, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis
                  dataKey="label"
                  minTickGap={12}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="sends"
                  allowDecimals={false}
                  width={32}
                  tick={{ fontSize: 11, fill: DISCIPLINE_HUE[type] }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  width={40}
                  tickFormatter={(rate) => `${rate}%`}
                  tick={{ fontSize: 11, fill: "var(--foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  yAxisId="sends"
                  dataKey="sends"
                  fill={DISCIPLINE_HUE[type]}
                  fillOpacity={0.65}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                {rows.length === 1 && (
                  <ReferenceLine
                    yAxisId="rate"
                    y={rows[0].rate}
                    stroke="var(--foreground)"
                    strokeWidth={2.5}
                  />
                )}
              </ComposedChart>
              <ChartHitRegions labels={labels} right={40} />
            </div>
          </ChartInspection>
        </>
      ) : (
        <p className="text-sm text-muted">No graded sends.</p>
      )}
    </div>
  );
}
