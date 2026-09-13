import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { DisciplineChip } from "./discipline-chip";
import { Grade } from "./grade";
import { StatStrip } from "./stat-strip";

const meta = { title: "Components/Data display/Stat strip", component: StatStrip } satisfies Meta<
  typeof StatStrip
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Statistics: Story = {
  render: () => (
    <StoryPage title="Statistics strip">
      <StatStrip
        cards={[
          {
            key: "sends",
            heading: <DisciplineChip type="boulder" />,
            stats: [
              { label: "Sends", value: 128 },
              { label: "Hardest", value: <Grade>V8</Grade> },
            ],
          },
          {
            key: "sessions",
            stats: [
              { label: "Sessions", value: 42 },
              { label: "Days outside", value: 18 },
            ],
          },
        ]}
      />
    </StoryPage>
  ),
};
