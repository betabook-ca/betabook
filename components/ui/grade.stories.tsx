import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { Grade } from "./grade";
import { GradeArrow, GradeSuggestion } from "./grade";
const meta = {
  title: "Components/Data display/Grade",
  component: Grade,
  args: { children: "V4" },
  decorators: [
    (Story) => (
      <StoryPage title="Grade">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Grade>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Boulder: Story = {};
export const Rope: Story = {
  args: {
    size: "md",
    children: (
      <>
        5.11a
        <GradeArrow direction="down" label="Softer than posted" />
      </>
    ),
  },
};
export const Harder: Story = {
  args: {
    children: (
      <>
        V4
        <GradeArrow direction="up" label="Harder than posted" />
      </>
    ),
  },
};
export const SuggestedHarder: Story = {
  args: {
    children: (
      <>
        V4
        <GradeSuggestion arrow={<GradeArrow direction="up" label="Harder than posted" />}>
          V5
        </GradeSuggestion>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          "A differing suggestion sits in parentheses with its arrow inside them, so the sign reads as part of the suggestion and cannot wrap onto its own line.",
      },
    },
  },
};
