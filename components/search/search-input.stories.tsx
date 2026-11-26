import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";

import { QueryInput } from "@/components/ui/query-input";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Components/Search/Input", component: QueryInput } satisfies Meta<
  typeof QueryInput
>;
export default meta;
type Story = StoryObj;
function Example() {
  const [value, setValue] = useState("cedar");
  return (
    <StoryPage title="Search input">
      <QueryInput label="Search climbs" value={value} onChange={setValue} />
      <output className="text-sm text-muted">
        {value ? `Searching for ${value}` : "Search cleared"}
      </output>
    </StoryPage>
  );
}
export const Input: Story = { render: () => <Example /> };
export const PointerFocus: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("searchbox", { name: "Search climbs" }));
  },
};
export const KeyboardFocus: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("searchbox", { name: "Search climbs" }));
    await userEvent.tab();
    await userEvent.tab({ shift: true });
  },
};
