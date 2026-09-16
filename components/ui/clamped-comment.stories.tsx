import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClampedComment } from "./clamped-comment";
const meta = {
  title: "Components/Data display/Clamped comment",
  component: ClampedComment,
  args: { children: "A short note." },
  decorators: [
    (Story) => (
      <StoryPage title="Clamped comment">
        <Story />
      </StoryPage>
    ),
  ],
  render: (args) => (
    <div className="max-w-sm text-sm">
      <ClampedComment {...args} />
    </div>
  ),
} satisfies Meta<typeof ClampedComment>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Short: Story = {};
export const Long: Story = {
  args: {
    children:
      "Worked the high foot, moved slowly across the slab, and found a better rest below the finish. ".repeat(
        5,
      ),
  },
};
export const ReadingLabels: Story = {
  args: { ...Long.args, expandLabel: "Read more", collapseLabel: "Read less" },
};

export const UpdatedComment: Story = {
  render: function UpdatedComment() {
    const [long, setLong] = useState(false);
    const note = "Found a new sequence at the crux and linked all of the moves.";
    return (
      <div className="flex max-w-sm flex-col gap-4 text-sm">
        <ClampedComment>{long ? `${note} `.repeat(8) : note}</ClampedComment>
        <button type="button" onClick={() => setLong(!long)}>
          {long ? "Shorten comment" : "Lengthen comment"}
        </button>
      </div>
    );
  },
};
