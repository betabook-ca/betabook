import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { goalPanelStoryArgs } from "@/stories/fixtures/goal-samples";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { GoalCompletionNotice } from "./goal-completion-notice";

const meta = {
  title: "Components/Goals/Completion celebration",
  component: GoalCompletionNotice,
  decorators: [
    (Story) => (
      <StoryPage title="Goal achieved">
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    goals: [goalPanelStoryArgs.initialCompleted.goals[0]],
    onView: () => {},
    rememberDismissal: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          "The production completion banner: a strong green surface, a compact 20px display headline, 14px achievement text, and an inline View action.",
      },
    },
  },
} satisfies Meta<typeof GoalCompletionNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BoldBanner: Story = {};

export const MultipleGoals: Story = {
  args: {
    goals: goalPanelStoryArgs.initialCompleted.goals
      .slice(0, 3)
      .map((goal) => ({ ...goal, completedDate: "2026-09-11" })),
  },
  parameters: {
    docs: {
      description: {
        story:
          "Three achievements share one compact banner. View opens History; dismissing acknowledges all achievements shown in this banner.",
      },
    },
  },
};

export const Yearly: Story = {
  args: {
    goals: [{ ...goalPanelStoryArgs.initialCompleted.goals[0], repeat: "year", timeframe: "year" }],
  },
};
