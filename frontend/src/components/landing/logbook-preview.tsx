import { AnalyticsGradePyramid } from "@/components/analytics/analytics-grade-pyramid";
import { StatTiles } from "@/components/analytics/analytics-stat-tiles";
import { ProgressionChart } from "@/components/analytics/progression-chart";
import { cardClass } from "@/components/ui/card";
import { PanelHeader } from "@/components/ui/eyebrow";
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
          <PanelHeader title="Boulder progression" />
          <ProgressionChart
            type="boulder"
            points={analytics.progression[0].points}
            sends={LANDING_DEMO_SENDS}
          />
        </div>
        <div className={`min-w-0 ${cardClass("fluid")}`}>
          <PanelHeader title="Grade pyramid" />
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
