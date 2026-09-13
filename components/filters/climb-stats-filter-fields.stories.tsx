import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbStatsFields } from "./climb-stats-filter-fields";
const meta = {
  title: "Components/Filters/Climb statistics",
  component: ClimbStatsFields,
  args: {
    ratingRange: [0, 5],
    minAscents: 0,
    onRatingRangeChange: () => {},
    onMinAscentsChange: () => {},
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Climb statistics filters"
        description="Enter a minimum ascent count directly in the short field. It starts at 0, meaning no minimum."
      >
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <>
        <ClimbStatsFields
          {...args}
          onRatingRangeChange={(ratingRange) => updateArgs({ ratingRange })}
          onMinAscentsChange={(minAscents) => updateArgs({ minAscents })}
        />
        <output aria-label="Selected statistics">
          {JSON.stringify({ ratingRange: args.ratingRange, minAscents: args.minAscents })}
        </output>
      </>
    );
  },
} satisfies Meta<typeof ClimbStatsFields>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const UpperBound: Story = { args: { ratingRange: [0, 2] } };
