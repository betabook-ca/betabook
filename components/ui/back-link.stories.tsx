import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { BackLink } from "./back-link";

const meta = {
  title: "Components/Navigation/Back link",
  component: BackLink,
  args: { href: "#all-lists", children: "All lists" },
  decorators: [
    (Story) => (
      <StoryPage
        title="Back link"
        description="A small muted link above a detail page's header, back to its index. Trips and climb lists use it."
      >
        <Story />
        <p id="all-lists">Local index destination</p>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof BackLink>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
