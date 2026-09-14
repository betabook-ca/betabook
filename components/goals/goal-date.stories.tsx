import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { GoalDate } from "./goal-date";

const meta = {
  title: "Components/Goals/Goal date",
  decorators: [
    (Story) => (
      <StoryPage title="Goals">
        <Story />
      </StoryPage>
    ),
  ],
  component: GoalDate,
  args: { children: "By Sep 30" },
} satisfies Meta<typeof GoalDate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {};
export const Completed: Story = { args: { completed: true, children: "Sep 30" } };
