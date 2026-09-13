import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import {
  DEFAULT_AREA_CLIMBS_FILTER,
  DEFAULT_AREA_CLIMBS_SORT,
} from "@/lib/filters/area-climbs-filter";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AreaClimbsToolbar } from "./area-climbs-toolbar";
const meta = {
  title: "Components/Filters/Area climbs toolbar",
  component: AreaClimbsToolbar,
  args: {
    areaPath: "/sample/area",
    filter: DEFAULT_AREA_CLIMBS_FILTER,
    sort: DEFAULT_AREA_CLIMBS_SORT,
  },
  decorators: [
    (Story) => (
      <StoryPage title="Area climb filters">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof AreaClimbsToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Expand filters" }));
  },
};
export const ActiveCollapsed: Story = {
  args: {
    filter: {
      ...DEFAULT_AREA_CLIMBS_FILTER,
      disciplines: ["sport"],
      sportRange: [10, 16],
      ratingRange: [3, 5],
      minAscents: 5,
    },
  },
};
