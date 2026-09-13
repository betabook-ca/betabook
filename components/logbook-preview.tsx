import { AnalyticsGradePyramid } from "@/components/analytics-grade-pyramid";
import { StatTiles } from "@/components/analytics-stat-tiles";
import { ProgressionChart } from "@/components/progression-chart";
import { cardClass } from "@/components/ui/card";
import { LANDING_DEMO_ANALYTICS, LANDING_DEMO_SENDS } from "@/lib/landing-demo";

export function LogbookPreview() {
  const analytics = LANDING_DEMO_ANALYTICS;
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <StatTiles
        className="grid-cols-3"
        tiles={[
          { label: "Sends", value: analytics.sendCount },
          { label: "Days out", value: analytics.daysOut },
          { label: "Hardest", value: analytics.hardest[0].label },
        ]}
      />
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <div className={`min-w-0 ${cardClass("fluid")}`}>
          <h3 className="mb-2 text-sm font-medium">Boulder progression</h3>
          <ProgressionChart
            type="boulder"
            points={analytics.progression[0].points}
            sends={LANDING_DEMO_SENDS}
          />
        </div>
        <div className={`min-w-0 ${cardClass("fluid")}`}>
          <h3 className="mb-2 text-sm font-medium">Grade pyramid</h3>
          <AnalyticsGradePyramid
            type="boulder"
            rows={analytics.pyramid[0].rows}
            sends={LANDING_DEMO_SENDS}
          />
        </div>
      </div>
      <figcaption className="text-xs text-muted">Sample data from a fictional climber.</figcaption>
    </figure>
  );
}
