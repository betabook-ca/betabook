import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { buildFeedCards } from "@/lib/feed-groups";
import { feedDays, feedEdgeDays } from "@/stories/fixtures/feed";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeedActivityCard } from "./feed-activity-card";

const group = buildFeedCards(feedDays, "all").find((card) => card.kind === "group");
if (!group) throw new Error("Expected shared feed fixture");
const trainingDay = feedEdgeDays.at(-1);
if (!trainingDay) throw new Error("Expected training feed fixture");
const meta = {
  title: "Components/Journal/Feed activity card",
  component: FeedActivityCard,
  parameters: { fullWidth: true },
  args: { entries: group.entries, view: "all" },
  decorators: [
    (Story) => (
      <StoryPage title="Feed activity">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof FeedActivityCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SharedClimb: Story = {};
export const SingleSend: Story = {
  args: { entries: [{ day: feedDays[2], activity: feedDays[2].activities[0] }] },
};
export const Training: Story = {
  args: {
    entries: [{ day: trainingDay, activity: trainingDay.activities[0] }],
    links: false,
  },
};
export const LargeGroup: Story = {
  args: {
    entries: Array.from({ length: 8 }, (_, index) => ({
      day: {
        ...group.entries[0].day,
        userId: `friend-${index}`,
        name: `Climbing friend ${index + 1} with a long name`,
      },
      activity: {
        ...group.entries[0].activity,
        id: index + 1,
        kind: index % 3 === 0 ? "send" : index % 3 === 1 ? "repeat" : "session",
        ascentStyle: index % 3 === 0 ? "flash" : null,
        reportedGrade: index % 3 === 2 ? null : 6,
        gradeFeel: index % 3 === 2 ? null : "high",
        body: `Notes from climber ${index + 1}.`,
      },
    })),
  },
};
