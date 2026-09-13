import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { chartSends } from "@/stories/fixtures/chart-sends";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ProgressionChart } from "./progression-chart";

const meta = {
  title: "Components/Charts/Progression chart",
  component: ProgressionChart,
  parameters: {
    docs: {
      description: {
        component:
          "A responsive chart showing the personal-best ceiling and monthly high points for the selected years. It always fits its card; dense histories narrow each month’s target to the gap between dots so neighbours never overlap. Preview up to three climb names under consolidated month/year headings, and open the full list only for larger groups.",
      },
    },
  },
} satisfies Meta<typeof ProgressionChart>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Progression: Story = {
  render: () => (
    <StoryPage title="Personal-best progression">
      <ProgressionChart
        type="boulder"
        sends={[
          ...chartSends(1, 3, "boulder", "2025-09"),
          ...chartSends(5, 5, "boulder", "2026-01"),
          ...chartSends(8, 4, "boulder", "2026-06"),
          ...chartSends(1, 7),
        ]}
        points={[
          { month: "2025-09", hardest: 3, best: 3 },
          { month: "2026-01", hardest: 5, best: 5 },
          { month: "2026-06", hardest: 4, best: 5 },
          { month: "2026-09", hardest: 7, best: 7 },
        ]}
      />
      <Example title="Single active month">
        <ProgressionChart
          type="sport"
          sends={chartSends(1, 12, "sport")}
          points={[{ month: "2026-09", hardest: 12, best: 12 }]}
        />
      </Example>
    </StoryPage>
  ),
};

export const DenseHistory: Story = {
  render: () => {
    const points = Array.from({ length: 36 }, (_, i) => ({
      month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      hardest: 3,
      best: 3,
    }));
    return (
      <StoryPage
        title="Consecutive months stay selectable"
        description="Dense histories fit the card without scrolling, keep a compact height, and give every month its own target."
      >
        <ProgressionChart
          type="boulder"
          points={points}
          sends={points.map((point, i) => ({
            ...chartSends(1, 3, "boulder", point.month)[0],
            climbId: 1000 + i,
          }))}
        />
      </StoryPage>
    );
  },
};
