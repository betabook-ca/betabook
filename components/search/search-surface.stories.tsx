import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SearchDemo } from "@/stories/fixtures/search-demo";

import { SearchSurface } from "./search-surface";

const meta = { title: "Components/Search/Surface", component: SearchSurface } satisfies Meta<
  typeof SearchSurface
>;
export default meta;
type Story = StoryObj;
export const FullResults: Story = { render: () => <SearchDemo /> };
export const QuickDialog: Story = { render: () => <SearchDemo surface="quick" /> };
