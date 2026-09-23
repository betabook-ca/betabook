import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { IndexRangeSelect } from "./index-select";

const BOULDER_GRADES = ["V0", "V1", "V2", "V3", "V4", "V5"];

const meta = {
  title: "Components/Inputs/Index select",
  component: IndexRangeSelect,
  args: {
    label: "Grades",
    minLabel: "Minimum grade",
    maxLabel: "Maximum grade",
    options: BOULDER_GRADES,
    range: [1, 4],
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <StoryPage title="Index select">
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [range, setRange] = useState(args.range);
    return <IndexRangeSelect {...args} range={range} onChange={setRange} />;
  },
} satisfies Meta<typeof IndexRangeSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Range: Story = {};

/** Rope grades are the longest labels the short field has to hold. */
export const RopeGrades: Story = {
  args: {
    minLabel: "Min grade",
    maxLabel: "Max grade",
    options: ["5.9", "5.10a", "5.11b", "5.12c"],
    range: [2, 3],
  },
};
