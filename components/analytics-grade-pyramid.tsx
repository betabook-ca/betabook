import { ChartClimbDetails } from "@/components/chart-climb-details";
import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import type { AnalyticsSendRow } from "@/db/queries";
import { formatCount } from "@/lib/format";
import type { ClimbType } from "@/lib/grades";
import type { PyramidRow } from "@/lib/user-analytics";

export function AnalyticsGradePyramid({
  type,
  rows,
  sends,
}: {
  type: ClimbType;
  rows: PyramidRow[];
  /** Already scoped to `type`. */
  sends: AnalyticsSendRow[];
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  const hue = DISCIPLINE_HUE[type];

  const summary = rows
    .filter((row) => row.count > 0)
    .map((row) => `${row.label}: ${formatCount(row.count, "send")}`)
    .join(", ");

  return (
    <>
      <p className="sr-only">Send pyramid: {summary}.</p>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-xs tabular-nums">
        {rows.map((row, i) => (
          <div key={row.label} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className="w-11 text-foreground">{row.label}</span>
            {row.count > 0 ? (
              <>
                <ChartClimbDetails
                  label={row.label}
                  sends={sends.filter((send) => send.suggestedGrade === row.grade)}
                  className="relative h-7 w-full min-w-0 justify-start rounded-xs p-0"
                >
                  <div
                    className="h-3 rounded-xs motion-safe:animate-bar-grow-x"
                    style={{
                      width: `${(row.count / max) * 100}%`,
                      backgroundColor: hue,
                      opacity: 0.65,
                      animationDelay: `${i * 15}ms`,
                    }}
                  />
                </ChartClimbDetails>
                <span className="text-muted">{row.count}</span>
              </>
            ) : (
              <>
                <div className="h-3" />
                <span />
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
