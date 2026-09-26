import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { HintCallout } from "./hint-callout";

const meta = {
  title: "Components/Feedback/Hint callout",
  component: HintCallout,
  args: {
    children:
      "Open your Mountain Project profile and copy the address from your browser. Your ID is the number in it.",
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Hint callout"
        description="A neutral hint beside a control: what to expect or where to find something. Operation feedback uses InlineAlert instead."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof HintCallout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Hint: Story = {};
