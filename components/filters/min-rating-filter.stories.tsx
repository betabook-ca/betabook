import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { RatingRangeFilter } from "./min-rating-filter";
const meta = {
  title: "Components/Filters/Rating range",
  id: "components-filters-minimum-rating",
  component: RatingRangeFilter,
  args: { value: [1, 5], onChange: () => {} },
  decorators: [
    (Story) => (
      <StoryPage
        title="Rating range"
        description="The full 1–5 range includes unrated climbs. Narrow either bound to filter ratings; crossing bounds moves the other end to match. Helper text explains whether unrated climbs are included as the range changes. Stars match the 16px result icons."
      >
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <RatingRangeFilter {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof RatingRangeFilter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Any: Story = {};
export const Rated: Story = { args: { value: [2, 4] } };
export const Maximum: Story = { args: { value: [1, 3] } };
export const Exact: Story = { args: { value: [3, 3] } };
