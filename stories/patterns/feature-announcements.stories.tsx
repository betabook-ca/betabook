import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { FeatureAnnouncement, FeatureAnnouncementScope } from "@/components/feature-announcement";
import {
  getAnnouncementCandidates,
  type FeatureAnnouncementDefinition,
} from "@/lib/feature-announcements";
import { StoryPage } from "@/stories/fixtures/story-layout";

const launches: FeatureAnnouncementDefinition[] = [
  "Session tags",
  "Year filters",
  "Custom layouts",
  "Partner summaries",
  "Flash charts",
].map((title, index) => ({
  featureId: `demo-feature-${index + 1}`,
  launchedAt: `2026-0${index + 1}-01T00:00:00Z`,
  page: "/demo",
  title,
  description: `Try the new ${title.toLowerCase()} controls. This example uses hypothetical release dates.`,
}));
function ReleaseExample({
  joined = "2026-03-15T00:00:00Z",
  now = "2026-05-15T00:00:00Z",
}: {
  joined?: string;
  now?: string;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [visit, setVisit] = useState(0);
  const eligible = getAnnouncementCandidates(launches, {
    page: "/demo",
    availableFeatureIds: launches.map((feature) => feature.featureId),
    userCreatedAt: new Date(joined),
    now: new Date(now),
  }).filter((feature) => !dismissed.includes(feature.featureId));
  return (
    <StoryPage
      title="Feature launches over time"
      description={`Joined ${joined.slice(0, 10)} · Viewing ${now.slice(0, 10)}. Hypothetical releases, using the production eligibility and page scope.`}
    >
      <p className="text-sm text-muted">
        {eligible.length} eligible updates. One callout per visit; dismiss it, then revisit to see
        the next.
      </p>
      <Button variant="outline" onPress={() => setVisit((value) => value + 1)}>
        Revisit page
      </Button>
      <FeatureAnnouncementScope
        key={visit}
        userId="demo-viewer"
        page="/demo"
        announcements={eligible}
        dismissAction={async (featureId) => {
          setDismissed((previous) => [...previous, featureId]);
          return { ok: true, value: undefined };
        }}
      >
        <div className="flex min-h-[28rem] flex-col items-start gap-6 py-4">
          {launches.map((feature, index) => (
            <div key={feature.featureId} className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted">{feature.launchedAt.slice(0, 10)}</span>
              <FeatureAnnouncement featureId={feature.featureId}>
                <Button variant="secondary">
                  Feature {index + 1}: {feature.title}
                </Button>
              </FeatureAnnouncement>
            </div>
          ))}
        </div>
      </FeatureAnnouncementScope>
    </StoryPage>
  );
}
const meta = {
  title: "Patterns/Feature announcements",
  component: FeatureAnnouncementScope,
} satisfies Meta<typeof FeatureAnnouncementScope>;
export default meta;
type Story = StoryObj;
export const JoinedAfterThirdLaunch: Story = { render: () => <ReleaseExample /> };
export const BrandNewAccount: Story = {
  render: () => <ReleaseExample joined="2026-05-15T00:00:00Z" />,
};
export const BeforeNextLaunch: Story = {
  render: () => <ReleaseExample now="2026-03-31T23:59:59Z" />,
};
export const LaunchDay: Story = { render: () => <ReleaseExample now="2026-04-01T00:00:00Z" /> };
export const BeforeAllLaunches: Story = {
  render: () => <ReleaseExample joined="2025-12-01T00:00:00Z" />,
};
