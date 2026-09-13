import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { UserAvatarStack } from "./user-avatar-stack";

const meta = {
  title: "Components/Data display/User avatar stack",
  component: UserAvatarStack,
} satisfies Meta<typeof UserAvatarStack>;
export default meta;
type Story = StoryObj;
export const Authors: Story = {
  render: () => (
    <StoryPage
      title="Authors in a feed card"
      description="Show up to three existing author avatars, followed by the remaining count. The stack is decorative; names remain readable beside it and on the individual updates."
    >
      {[2, 3, 8].map((count) => (
        <div key={count} className="flex items-center gap-3">
          <UserAvatarStack
            users={Array.from({ length: count }, (_, index) => ({
              id: String(index),
              name: ["Alex Rivera", "Jordan Lee", "Sam Chen"][index % 3],
            }))}
          />
          <span>{count} authors</span>
        </div>
      ))}
    </StoryPage>
  ),
};
