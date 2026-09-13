import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { FilterToolbarDemo } from "@/stories/fixtures/filter-toolbar-demo";
const meta = { title: "Patterns/Filters", component: FilterToolbarDemo } satisfies Meta<
  typeof FilterToolbarDemo
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AreaClimbs: Story = { args: { list: "area" } };
export const Sends: Story = { args: { list: "sends" } };
export const Journal: Story = { args: { list: "journal" } };
