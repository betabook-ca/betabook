import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AddKindNav } from "./add-kind-nav";

const meta = {
  title: "Components/Navigation/Add kind",
  component: AddKindNav,
  args: { current: "climb" },
  decorators: [
    (Story) => (
      <StoryPage title="Add a climb or area">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof AddKindNav>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Climb: Story = {};
export const Area: Story = { args: { current: "area" } };
