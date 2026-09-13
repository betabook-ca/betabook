import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  STORY_CLIMBER_OVERVIEW,
  STORY_NEW_CLIMBER_OVERVIEW,
} from "@/stories/fixtures/climber-overview";

import { FriendshipButton } from "./friendship-button";
import { ProfileHeading } from "./profile-heading";
import { ShareProfileButton } from "./share-profile-button";

const meta = {
  title: "Components/Profile/Heading",
  component: ProfileHeading,
  args: {
    name: "Alex Morgan",
    overview: STORY_CLIMBER_OVERVIEW,
    nameAction: (
      <ShareProfileButton name="Alex Morgan" url="https://betabook.ca/users/sample?share=demo" />
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

const hiddenJournalNote = <p className="text-muted">Their journal isn&apos;t shared with you.</p>;

export const MemberProfile: Story = {};
export const AnotherClimber: Story = {
  args: {
    name: "Riley Chen",
    nameAction: undefined,
    actions: (
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
    nameAction: undefined,
    actions: (
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
    overview: { ...STORY_CLIMBER_OVERVIEW, daysOut: null },
    nameAction: undefined,
    actions: (
      <FriendshipButton
        userId="sample"
        name="Jordan Lee"
        initialStatus="none"
        appearance="profile"
      />
    ),
    note: hiddenJournalNote,
  },
};
export const LongestGrades: Story = {
  args: {
    overview: {
      ...STORY_CLIMBER_OVERVIEW,
      hardest: [
        { type: "sport", grade: "5.15d", sendCount: 337 },
        { type: "trad", grade: "5.15d", sendCount: 314 },
        { type: "boulder", grade: "V17", sendCount: 309 },
      ],
    },
  },
};
export const NewClimber: Story = {
  args: { overview: STORY_NEW_CLIMBER_OVERVIEW },
};
