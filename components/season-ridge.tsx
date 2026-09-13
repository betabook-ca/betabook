import type { SeasonWeek } from "@/lib/climber-season";
import { formatCount } from "@/lib/format";
import { formatMonthLabel } from "@/lib/user-analytics";

const HEIGHT = 48;
const STEP = 10;
// A floor keeps one lone day from reading as a peak week.
const MIN_SCALE = 3;

export function SeasonRidge({
  season,
  counting,
}: {
  season: SeasonWeek[];
  counting: "days out" | "sending days";
}) {
  const total = season.reduce((sum, week) => sum + week.days, 0);
  const scale = Math.max(MIN_SCALE, ...season.map((week) => week.days));
  const width = (season.length - 1) * STEP;
  const points = season.map(
    (week, index) => `${index * STEP},${(HEIGHT - (week.days / scale) * (HEIGHT - 4)).toFixed(1)}`,
  );
  const line = `M${points.join("L")}`;
  const noun = counting === "days out" ? ["day out", "days out"] : ["sending day", "sending days"];

  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <svg
        aria-hidden
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-12 w-full overflow-visible motion-safe:animate-ridge-reveal"
      >
        <path d={`${line}L${width},${HEIGHT}L0,${HEIGHT}Z`} className="fill-accent/25" />
        <path
          d={line}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.75}
          strokeLinejoin="round"
          className="stroke-accent-soft-foreground"
        />
        <line
          x1={0}
          x2={width}
          y1={HEIGHT}
          y2={HEIGHT}
          vectorEffect="non-scaling-stroke"
          className="stroke-border"
        />
      </svg>
      <div aria-hidden className="flex justify-between text-xs text-muted">
        <span>{season.length > 0 && formatMonthLabel(season[0].start.slice(0, 7))}</span>
        <span>This week</span>
      </div>
      <figcaption className="text-sm">
        {total === 0
          ? `No ${noun[1]} in the last 12 months`
          : `${formatCount(total, noun[0], noun[1])} in the last 12 months`}
      </figcaption>
    </figure>
  );
}
