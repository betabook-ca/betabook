import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SendGradeCell } from "./send-grade-cell";
const meta = {
  title: "Components/Data display/Send grade",
  component: SendGradeCell,
  decorators: [
    (Story) => (
      <StoryPage title="Grade and rating">
        <Story />
      </StoryPage>
    ),
  ],
  args: { type: "sport", grade: 20, gradeFeel: "solid", rating: 2 },
  parameters: {
    docs: {
      description: {
        component:
          "A muted dot separates grade and rating; the number precedes its star. Ascent style remains on the row below in result lists.",
      },
    },
  },
} satisfies Meta<typeof SendGradeCell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rope: Story = {};
export const Boulder: Story = { args: { type: "boulder", grade: 5, rating: 4 } };
export const SuggestedHarder: Story = {
  args: { type: "boulder", grade: 11, suggestedGrade: 10, gradeFeel: "high", rating: 4 },
  parameters: {
    docs: {
      description: {
        story:
          "The climber's differing suggestion in parentheses, with the feel arrow inside them.",
      },
    },
  },
};
