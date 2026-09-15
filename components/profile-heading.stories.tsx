import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { STORY_HARDEST } from "@/stories/fixtures/climber-hardest";

import { FriendshipButton } from "./friendship-button";
import { ProfileHeading } from "./profile-heading";

const meta = {
  title: "Components/Profile/Heading",
  component: ProfileHeading,
  args: {
    name: "Alex Morgan",
    hardest: STORY_HARDEST,
  },
  decorators: [
    (Story) => (
      <div className="xl:w-68">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileHeading>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MemberProfile: Story = {};
export const AnotherClimber: Story = {
  args: {
    name: "Riley Chen",
    nameAction: (
      <FriendshipButton
        userId="sample"
        name="Riley Chen"
        initialStatus="friends"
        appearance="profile"
      />
    ),
  },
};
export const IncomingRequest: Story = {
  args: {
    name: "Sam Taylor",
    nameAction: (
      <FriendshipButton
        userId="sample"
        name="Sam Taylor"
        initialStatus="incoming"
        appearance="profile"
      />
    ),
  },
};
export const Stranger: Story = {
  args: {
    name: "Jordan Lee",
    nameAction: (
      <FriendshipButton
        userId="sample"
        name="Jordan Lee"
        initialStatus="none"
        appearance="profile"
      />
    ),
    note: <p className="text-muted">Their journal isn&apos;t shared with you.</p>,
  },
};
export const LongestGrades: Story = {
  args: {
    hardest: [
      { type: "sport", grade: "5.15d" },
      { type: "trad", grade: "5.15d" },
      { type: "boulder", grade: "V17" },
    ],
  },
};
export const NewClimber: Story = {
  args: { hardest: [] },
};
