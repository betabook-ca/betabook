import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { FriendFilter } from "./friend-filter";

const meta = {
  title: "Components/Filters/Friend filter",
  component: FriendFilter,
  args: {
    value: [],
    friends: [
      { id: "sam", name: "Sam Rivera" },
      { id: "lee", name: "Lee Park" },
    ],
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <StoryPage title="With friend">
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <FriendFilter {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof FriendFilter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { value: ["sam", "lee"] } };
export const Empty: Story = { args: { friends: [] } };
