import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { SuggestedClimberRow } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FriendSuggestions } from "./friend-suggestions";

const meta = {
  title: "Components/Profile/Friend suggestions",
  component: FriendSuggestions,
} satisfies Meta<typeof FriendSuggestions>;
export default meta;
type Story = StoryObj;

const climber = (id: string, name: string, mutualFriendCount: number): SuggestedClimberRow => ({
  id,
  name,
  image: null,
  friendshipStatus: "none",
  mutualFriendCount,
});

export const Default: Story = {
  render: () => (
    <StoryPage title="Friend suggestions">
      <FriendSuggestions
        climbers={[
          climber("sam", "Sam Rivera", 3),
          climber("jordan", "Jordan Park", 2),
          climber("alexandra", "Alexandra Montgomery-Castellanos", 1),
          climber("kai", "Kai Nakamura", 1),
        ]}
      />
    </StoryPage>
  ),
};
