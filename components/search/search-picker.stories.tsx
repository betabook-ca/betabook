import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ClimbPickerDemo } from "@/stories/fixtures/search-demo";

import { SearchPicker } from "./search-picker";

const meta = { title: "Components/Search/Climb picker", component: SearchPicker } satisfies Meta<
  typeof SearchPicker
>;
export default meta;
type Story = StoryObj;
export const Logging: Story = { render: () => <ClimbPickerDemo /> };
export const Merge: Story = { render: () => <ClimbPickerDemo mode="merge" /> };
