"use client";
import { ReferenceLine, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { ChartInspection, ChartHitRegions } from "@/components/chart-inspection";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { useChartWidth } from "@/hooks/use-chart-width";
import { sendChartRows, type ChartSend, type ChartDetailGroup } from "@/lib/chart-details";
import { formatCount } from "@/lib/format";
import type { ClimbType } from "@/lib/grades";
import { ASCENT_STYLE_LABELS } from "@/lib/sends";
import { firstTryStyles, styleRateTitle, type FirstTryStyle } from "@/lib/style-rates";
import type { StyleRateGradeRow } from "@/lib/user-analytics";

/** Each line wears its ascent chip's hue (flash blue, onsight green), so the
 * bars stay neutral rather than a discipline hue that would hide one line. */
const SERIES = {
  flash: { key: "flashRate", count: "flashes", plural: "flashes", color: "var(--chart-flash)" },
  onsight: {
    key: "onsightRate",
    count: "onsights",
    plural: "onsights",
    color: "var(--chart-onsight)",
  },
} as const satisfies Record<
  FirstTryStyle,
  {
    key: keyof StyleRateGradeRow;
    count: keyof StyleRateGradeRow;
    plural: string;
    color: string;
  }
>;
const BAR_COLOR = "var(--muted)";

/** Sends per grade with the flash and onsight rates overlaid, matching the
 * Flash and Onsight stat cards. Boulders can't be onsighted, so bouldering
 * draws the flash line alone. */
export function AnalyticsFlashChart({
  rows,
  type,
  sends,
}: {
  rows: StyleRateGradeRow[];
  type: ClimbType;
  /** Already scoped to `type`. */
  sends?: ChartSend[];
}) {
  const { ref, width } = useChartWidth();
  const styles = firstTryStyles(type);
  const series = styles.map((style) => ({ ...SERIES[style], name: ASCENT_STYLE_LABELS[style] }));
  // Counts as well as rates, so the labels carry what the chart shows to a
  // reader who can't see it.
  const rates = (row: StyleRateGradeRow) =>
    series
      .map(
        (s) =>
          `${formatCount(row[s.count], s.name.toLowerCase(), s.plural)} (${Math.round(row[s.key])}%)`,
      )
      .join(" · ");
  const labels = rows.map(
    (row) => `${row.label}: ${formatCount(row.sends, "send")} · ${rates(row)}`,
  );
  const details =
    sends &&
    Object.fromEntries(
      rows.map((row, i) => [
        labels[i],
        {
          title: row.label,
          summary: `${formatCount(row.sends, "send")} · ${rates(row)}`,
          rows: sendChartRows(
            sends.filter(
              (send) =>
                send.suggestedGrade != null &&
                send.suggestedGrade >= row.range[0] &&
                send.suggestedGrade <= row.range[1],
            ),
          ),
        } satisfies ChartDetailGroup,
      ]),
    );
  return (
    <div className="min-w-0" ref={ref}>
      <h3 className={`mb-4 ${EYEBROW_CLASS}`}>{styleRateTitle(type)}</h3>
      {rows.length ? (
        <>
          <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-xs"
                style={{ backgroundColor: BAR_COLOR, opacity: 0.35 }}
              />
              Total sends
            </span>
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-2">
                <span className="w-4 border-t-2" style={{ borderColor: s.color }} />
                {s.name} rate
              </span>
            ))}
          </div>
          <ChartInspection
            label={`Sends and ${styles.join(" and ")} percentage by grade`}
            details={details}
          >
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
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  width={40}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 11, fill: "var(--foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  yAxisId="sends"
                  dataKey="sends"
                  fill={BAR_COLOR}
                  fillOpacity={0.35}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
                {series.map((s) =>
                  rows.length === 1 ? (
                    <ReferenceLine
                      key={s.key}
                      yAxisId="rate"
                      y={rows[0][s.key]}
                      stroke={s.color}
                      strokeWidth={2.5}
                    />
                  ) : (
                    <Line
                      key={s.key}
                      yAxisId="rate"
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  ),
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
