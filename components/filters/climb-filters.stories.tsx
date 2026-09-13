import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";

import { ClimbFilters } from "@/components/filters/climb-filters";
import { DEFAULT_CLIMB_REFINEMENTS } from "@/lib/filters/climb-refinements";
import { DemoAreaControl } from "@/stories/fixtures/search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Components/Filters/Climb filters", component: ClimbFilters } satisfies Meta<
  typeof ClimbFilters
>;
export default meta;
type Story = StoryObj;
function Example() {
  const [value, setValue] = useState(DEFAULT_CLIMB_REFINEMENTS);
  return (
    <StoryPage title="Climb refinements">
      <ClimbFilters
        value={value}
        onChange={setValue}
        areaControl={
          <DemoAreaControl
            selected={value.area}
            onChange={(area) => setValue({ ...value, area })}
          />
        }
      />
    </StoryPage>
  );
}
export const Filters: Story = { render: () => <Example /> };

export const Expanded: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Expand filters" }));
  },
};
