import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  STORY_CLIMBER_OVERVIEW,
  STORY_NEW_CLIMBER_OVERVIEW,
} from "@/stories/fixtures/climber-overview";

import { FriendshipButton } from "./friendship-button";
import { LogEntryButton } from "./journal";
import { ProfileFriendsLink } from "./profile-friends-link";
import { ProfileHeading } from "./profile-heading";
import { ShareProfileButton } from "./share-profile-button";

const meta = {
  title: "Components/Profile/Heading",
  component: ProfileHeading,
  args: {
    name: "Alex Morgan",
    overview: STORY_CLIMBER_OVERVIEW,
    analyticsHref: "/users/sample/analytics",
    actions: (
      <>
        <LogEntryButton />
        <ShareProfileButton name="Alex Morgan" url="https://betabook.ca/users/sample?share=demo" />
        <ProfileFriendsLink userId="sample" />
      </>
    ),
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
    overview: { ...STORY_CLIMBER_OVERVIEW, daysOut: null },
    actions: (
      <FriendshipButton
        userId="sample"
        name="Riley Chen"
        initialStatus="friends"
        appearance="profile"
      />
    ),
    note: (
      <p className="text-sm text-muted">Riley Chen&apos;s journal isn&apos;t shared with you.</p>
    ),
  },
};
export const NewClimber: Story = {
  args: { overview: STORY_NEW_CLIMBER_OVERVIEW },
};
