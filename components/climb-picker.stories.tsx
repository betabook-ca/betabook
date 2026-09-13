import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IntegratedClimbPickerDemo } from "@/stories/fixtures/app-search-demo";

import { ClimbPicker } from "./climb-picker";
const meta = { title: "Components/Search/App climb picker", component: ClimbPicker } satisfies Meta<
  typeof ClimbPicker
>;
export default meta;
type Story = StoryObj;
export const Logging: Story = { render: () => <IntegratedClimbPickerDemo /> };
export const Empty: Story = { render: () => <IntegratedClimbPickerDemo initialQuery="" /> };
export const Import: Story = { render: () => <IntegratedClimbPickerDemo mode="import" /> };
export const Merge: Story = { render: () => <IntegratedClimbPickerDemo mode="merge" /> };
