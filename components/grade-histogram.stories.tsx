import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { GradeHistogramChart } from "./grade-histogram";

const meta = {
  title: "Components/Charts/Grade histogram",
  component: GradeHistogramChart,
} satisfies Meta<typeof GradeHistogramChart>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const AreaHistogram: Story = {
  render: () => (
    <StoryPage title="Area grade distribution">
      <GradeHistogramChart
        areaPath="/areas/1/north-woods"
        histogram={{
          totalClimbs: 14,
          ungradedCount: 1,
          disciplines: ["boulder"],
          boulderSpan: ["V1", "V3"],
          ropeSpan: null,
          groups: [
            {
              type: "boulder",
              buckets: [
                { label: "V1", count: 8, range: [2, 2] },
                { label: "V2", count: 3, range: [3, 3] },
                { label: "V3", count: 2, range: [4, 4] },
              ],
            },
          ],
        }}
      />
    </StoryPage>
  ),
};
