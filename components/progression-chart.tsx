"use client";
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- Arrow keys move focus between the named chart's month points. */
import { ChartClimbDetails } from "@/components/chart-climb-details";
import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import type { AnalyticsSendRow } from "@/db/queries";
import { useChartWidth } from "@/hooks/use-chart-width";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import { formatMonthLabel, type ProgressionPoint } from "@/lib/user-analytics";

const H = 200;
const MARGIN = { top: 10, right: 12, bottom: 24, left: 40 };
const PLOT_H = H - MARGIN.top - MARGIN.bottom;
const TARGET = 24;

function monthIndex(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + (m - 1);
}

/** The ceiling line: a climber's personal best over time as a stepped line
 * in the discipline hue, with a dot for the hardest send of each active
 * month underneath it. Native grade rules on the y-axis, years along the
 * x-axis; hovering a dot names its month and grade. */
export function ProgressionChart({
  type,
  points,
  sends,
}: {
  type: ClimbType;
  points: ProgressionPoint[];
  sends: AnalyticsSendRow[];
}) {
  const { ref, width: W } = useChartWidth();
  if (points.length === 0) return null;

  const scale = nativeGradeArray(type);
  const hue = DISCIPLINE_HUE[type];

  const m0 = monthIndex(points[0].month);
  const m1 = monthIndex(points[points.length - 1].month);
  const singleMonth = m1 === m0;
  const PLOT_W = W - MARGIN.left - MARGIN.right;
  const x = (month: string) =>
    singleMonth
      ? MARGIN.left + PLOT_W / 2
      : MARGIN.left + ((monthIndex(month) - m0) / (m1 - m0)) * PLOT_W;

  const gradeMin = Math.max(Math.min(...points.map((p) => p.hardest)) - 1, 0);
  const gradeMax = Math.min(Math.max(...points.map((p) => p.best)) + 1, scale.length - 1);
  const y = (grade: number) =>
    MARGIN.top + (1 - (grade - gradeMin) / Math.max(gradeMax - gradeMin, 1)) * PLOT_H;

  // A target wider than the gap to a dot within its height would swallow that
  // month's taps, so dense logs narrow their targets instead of scrolling.
  const xs = points.map((point) => x(point.month));
  const ys = points.map((point) => y(point.hardest));
  const targetWidth = (i: number) => {
    let width = TARGET;
    for (let j = 0; j < points.length; j += 1) {
      if (j !== i && Math.abs(ys[j] - ys[i]) < TARGET) {
        width = Math.min(width, Math.abs(xs[j] - xs[i]));
      }
    }
    return width;
  };

  // Grade rules: one hairline per grade in the visible span, a label on
  // every `labelStep`-th so wide spans don't collide.
  const gradeCount = gradeMax - gradeMin + 1;
  const labelStep = Math.ceil(gradeCount / 7);
  const grades = Array.from({ length: gradeCount }, (_, i) => gradeMin + i);

  // Year ticks: every January inside the span; a span within one calendar
  // year gets its single year under the middle instead.
  const yearTicks: { x: number; label: string }[] = [];
  for (let m = m0; m <= m1; m += 1) {
    if (m % 12 === 0) {
      yearTicks.push({
        x: singleMonth ? MARGIN.left + PLOT_W / 2 : MARGIN.left + ((m - m0) / (m1 - m0)) * PLOT_W,
        label: String(Math.floor(m / 12)),
      });
    }
  }
  const yearStep = Math.max(1, Math.ceil(yearTicks.length / Math.max(2, Math.floor(W / 75))));
  const shownYears =
    yearTicks.length > 0
      ? yearTicks.filter((_, i) => i % yearStep === 0)
      : [{ x: MARGIN.left + PLOT_W / 2, label: points[0].month.slice(0, 4) }];

  // Personal-best step path: horizontal to each active month, vertical when
  // the ceiling rises there, then a run-out to the right edge.
  const pathParts = [`M ${x(points[0].month)} ${y(points[0].best)}`];
  for (let i = 1; i < points.length; i += 1) {
    pathParts.push(`H ${x(points[i].month)}`);
    if (points[i].best !== points[i - 1].best) pathParts.push(`V ${y(points[i].best)}`);
  }
  pathParts.push(`H ${MARGIN.left + PLOT_W}`);

  const latest = points[points.length - 1];

  return (
    <div ref={ref}>
      <p className="mb-2 text-xs text-muted">
        Hover or tap to preview the month’s hardest climbs. Groups larger than three open the full
        list.
      </p>
      <p className="sr-only">
        Personal best {scale[latest.best]}, from {formatMonthLabel(points[0].month)} (
        {scale[points[0].hardest]}) to {formatMonthLabel(latest.month)}.
      </p>
      <div
        role="region"
        aria-label={`${type} grade progression`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            !event.currentTarget.contains(event.target as Node) ||
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
          )
            return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          );
          if (!buttons.length) return;
          event.preventDefault();
          const active = buttons.indexOf(event.target as HTMLButtonElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : Math.max(
                    0,
                    Math.min(buttons.length - 1, active + (event.key === "ArrowLeft" ? -1 : 1)),
                  );
          buttons[next].focus();
        }}
        className="focus-visible:status-focused"
      >
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-muted" aria-hidden>
            {grades.map((grade) => (
              <g key={grade}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + PLOT_W}
                  y1={y(grade)}
                  y2={y(grade)}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  strokeWidth={0.5}
                />
                {(gradeCount - 1 - (grade - gradeMin)) % labelStep === 0 && (
                  <text
                    x={MARGIN.left - 6}
                    y={y(grade)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="currentColor"
                  >
                    {scale[grade]}
                  </text>
                )}
              </g>
            ))}
            {shownYears.map((tick) => (
              <text
                key={tick.label + tick.x}
                x={tick.x}
                y={H - 8}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
              >
                {tick.label}
              </text>
            ))}
            <path
              d={pathParts.join(" ")}
              fill="none"
              stroke={hue}
              strokeWidth={2.5}
              strokeLinejoin="round"
              pathLength={1}
              className="motion-safe:animate-line-draw"
            />
            {points.map((point) => (
              <circle
                key={point.month}
                cx={x(point.month)}
                cy={y(point.hardest)}
                r={3}
                fill={hue}
                fillOpacity={0.55}
              >
                <title>{`${formatMonthLabel(point.month)} · ${scale[point.hardest]}`}</title>
              </circle>
            ))}
          </svg>
          {points.map((point, i) => (
            <ChartClimbDetails
              key={point.month}

              hideSingleCount
              label={`${formatMonthLabel(point.month)} · ${scale[point.hardest]}`}
              sends={sends.filter(
                (send) =>
                  send.climbType === type &&
                  send.suggestedGrade === point.hardest &&
                  send.dateSent?.startsWith(`${point.month}-`),
              )}
              className="absolute min-w-0 -translate-x-1/2 -translate-y-1/2 rounded-full p-0 hover:bg-default"
              style={{
                // Shares of the chart, not px: a card narrower than useChartWidth's
                // 240px floor scales the SVG down, and the targets must scale with it.
                width: `${(targetWidth(i) / W) * 100}%`,
                height: `${(TARGET / H) * 100}%`,
                left: `${(xs[i] / W) * 100}%`,
                top: `${(ys[i] / H) * 100}%`,
              }}
            >
              <span
                className="pointer-events-none size-2 shrink-0 rounded-full"
                style={{ backgroundColor: hue }}
              />
            </ChartClimbDetails>
          ))}
        </div>
      </div>
    </div>
  );
}
