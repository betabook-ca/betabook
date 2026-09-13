import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ProgressBar } from "./progress-bar";

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
