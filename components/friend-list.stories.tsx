import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { FriendList } from "./friend-list";

const meta = { title: "Components/Profile/Friend list", component: FriendList } satisfies Meta<
  typeof FriendList
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    requestsOnly: false,
    fetchPage: async () => ({
      friends: [
        {
          id: "last",
          name: "Zoe Rivera",
          image: null,
          isPrivate: false,
          friendshipStatus: "friends",
        },
      ],
      hasMore: false,
    }),
    initialPage: {
      friends: Array.from({ length: 10 }, (_, i) => ({
        id: `partner-${i}`,
        name: i === 0 ? "Alexandra Montgomery-Castellanos" : `Climbing partner ${i + 1}`,
        image: null,
        isPrivate: i === 1,
        friendshipStatus: "friends",
      })),
      hasMore: true,
    },
  },
  render: (args) => (
    <StoryPage title="Friends">
      <FriendList {...args} />
    </StoryPage>
  ),
};
