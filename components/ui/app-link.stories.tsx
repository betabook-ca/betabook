import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AppLink } from "./app-link";
const meta = {
  title: "Components/Navigation/App link",
  component: AppLink,
  args: { href: "#sample-destination", children: "North Woods", prefetch: false },
  decorators: [
    (Story) => (
      <StoryPage title="App link">
        <Story />
      </StoryPage>
    ),
  ],
  render: (args) => (
    <>
      <AppLink {...args} />
      <p id="sample-destination">Local sample destination</p>
    </>
  ),
} satisfies Meta<typeof AppLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
