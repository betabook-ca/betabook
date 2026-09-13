import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { RatingField } from "./rating-field";

const meta = {
  title: "Components/Inputs/Rating field",
  component: RatingField,
  args: { value: null, onValueChange: () => {} },
  decorators: [
    (Story) => (
      <StoryPage
        title="Rating stars"
        description="Shared by Log entry and minimum/maximum rating filters. Click the selected star again to clear the rating."
      >
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <RatingField {...args} onValueChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof RatingField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unrated: Story = {};
export const Rated: Story = { args: { value: 3 } };
