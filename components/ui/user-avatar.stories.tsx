import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { UserAvatar } from "./user-avatar";

const meta = { title: "Components/Data display/User avatar", component: UserAvatar } satisfies Meta<
  typeof UserAvatar
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Avatars: Story = {
  render: () => (
    <StoryPage
      title="Avatar fallbacks"
      description="Initials are decorative beside a visible name. No external image requests are needed for these examples."
    >
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex items-center gap-3">
          <UserAvatar name="Alex Rivera" size={size} />
          <span>Alex Rivera · {size}</span>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <UserAvatar name="李" />
        <span>李 · single-character name</span>
      </div>
    </StoryPage>
  ),
};
