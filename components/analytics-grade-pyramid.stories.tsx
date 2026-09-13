import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { nativeGradeArray } from "@/lib/grades";
import { chartSends } from "@/stories/fixtures/chart-sends";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsGradePyramid } from "./analytics-grade-pyramid";

const meta = {
  title: "Components/Charts/Grade pyramid",
  component: AnalyticsGradePyramid,
  parameters: {
    docs: {
      description: {
        component:
          "A compact half-width dashboard chart. Hover, focus, or tap to preview up to three climb names for the selected grade. Only larger groups open the full list. Tab moves between grade rows; zero-send grades remain visible.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsGradePyramid>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const GradePyramid: Story = {
  render: () => (
    <StoryPage title="Grade pyramids">
      {(["boulder", "sport", "trad"] as const).map((type) => (
        <Example key={type} title={type}>
          <AnalyticsGradePyramid
            type={type}
            sends={[...chartSends(2, 5, type), ...chartSends(12, 3, type)]}
            rows={[
              { grade: 5, label: nativeGradeArray(type)[5], count: 2 },
              { grade: 4, label: nativeGradeArray(type)[4], count: 0 },
              { grade: 3, label: nativeGradeArray(type)[3], count: 12 },
            ]}
          />
        </Example>
      ))}
    </StoryPage>
  ),
};

export const PreviewBoundary: Story = {
  render: () => (
    <StoryPage
      title="Up to three climbs in a preview; four open the full list"
      description="Hover or focus to preview up to three climbs. Tap small groups to read their preview; only larger groups open a table."
    >
      <AnalyticsGradePyramid
        type="boulder"
        rows={[
          { grade: 5, label: "V4", count: 1 },
          { grade: 4, label: "V3", count: 3 },
          { grade: 3, label: "V2", count: 4 },
        ]}
        sends={[...chartSends(1, 5), ...chartSends(3, 4), ...chartSends(4, 3)]}
      />
    </StoryPage>
  ),
};
