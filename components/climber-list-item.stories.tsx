import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimberListItem } from "./climber-list-item";

const meta = {
  title: "Components/Profile/Climber list item",
  component: ClimberListItem,
} satisfies Meta<typeof ClimberListItem>;
export default meta;
type Story = StoryObj;

export const FriendshipActions: Story = {
  render: () => (
    <StoryPage
      title="Climbers"
      description="Friendship actions sit beside the name at every screen size."
    >
      <div>
        <ClimberListItem
          climber={{ id: "suzi", name: "Suzi Lu", image: null, friendshipStatus: "friends" }}
        />
        <ClimberListItem
          climber={{
            id: "alexandra",
            name: "Alexandra Montgomery-Castellanos",
            image: null,
            friendshipStatus: "none",
          }}
          detail="3 mutual friends"
        />
        <ClimberListItem
          climber={{ id: "sam", name: "Sam Rivera", image: null, friendshipStatus: "incoming" }}
          detail="Wants to be friends"
        />
      </div>
    </StoryPage>
  ),
};
