import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IntegratedSearchDemo } from "@/stories/fixtures/app-search-demo";

import { SearchController } from "./search-controller";
const meta = { title: "Components/Search/Controller", component: SearchController } satisfies Meta<
  typeof SearchController
>;
export default meta;
type Story = StoryObj;
export const Journey: Story = { render: () => <IntegratedSearchDemo surface="journey" /> };
export const Retry: Story = { render: () => <IntegratedSearchDemo failure /> };
