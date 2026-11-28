import type { Meta, StoryObj } from "@storybook/react-vite";

import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { AmountMeter, ProgressBar } from "./progress-bar";

const meta = { title: "Components/Feedback/Progress bar", component: ProgressBar } satisfies Meta<
  typeof ProgressBar
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Progress: Story = {
  render: () => (
    <StoryPage title="Import progress">
      {[0, 40, 100].map((value) => (
        <Example key={value} title={`${value} of 100 rows`}>
          <ProgressBar value={value} max={100} label="Importing sample sends" />
        </Example>
      ))}
    </StoryPage>
  ),
};
export const Amount: Story = {
  render: () => (
    <StoryPage title="Goal progress and plan usage">
      <Example title="2 of 3 sessions (small)">
        <div className="w-24">
          <AmountMeter size="sm" value={2} max={3} label="Train 3 times every week" />
        </div>
      </Example>
      <Example title="40% of the included requests">
        <AmountMeter value={40} max={100} label="Worker requests used" />
      </Example>
    </StoryPage>
  ),
};
