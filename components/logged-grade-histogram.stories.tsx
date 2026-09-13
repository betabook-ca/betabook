import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { LoggedGradeHistogram } from "./logged-grade-histogram";

const meta = {
  title: "Components/Charts/Logged grade histogram",
  component: LoggedGradeHistogram,
} satisfies Meta<typeof LoggedGradeHistogram>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const LoggedGrades: Story = {
  render: () => (
    <StoryPage title="Community grade opinions">
      <LoggedGradeHistogram
        type="boulder"
        rows={[
          { label: "V3", total: 2, isPosted: false, feelCounts: { low: 0, solid: 2, high: 0 } },
          { label: "V4", total: 8, isPosted: true, feelCounts: { low: 2, solid: 5, high: 1 } },
          { label: "V5", total: 1, isPosted: false, feelCounts: { low: 1, solid: 0, high: 0 } },
        ]}
      />
    </StoryPage>
  ),
};
