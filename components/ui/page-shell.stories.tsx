import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { cardClass } from "./card";
import { SidebarLayout } from "./page-shell";
const meta = {
  title: "Components/Layout/Sidebar layout",
  component: SidebarLayout,
  args: {
    sidebar: <div className={cardClass("sm")}>Sidebar content comes first on mobile.</div>,
    children: <div className={cardClass("fluid")}>Primary content</div>,
  },
  decorators: [
    (Story) => (
      <StoryPage title="Sidebar layout">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof SidebarLayout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Right: Story = {};
export const Left: Story = { args: { side: "left" } };
