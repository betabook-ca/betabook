import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  feedDays,
  feedEdgeDays,
  feedPartialDays,
  feedSessionHistory,
} from "@/stories/fixtures/feed";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeedTimeline } from "./feed-timeline";

const meta = {
  title: "Components/Journal/Feed timeline",
  component: FeedTimeline,
  parameters: {
    fullWidth: true,
    docs: {
      description: {
        component:
          "The production feed uses a centered 672px column and one date heading per day. Posted grades belong to climbs; personal suggestions belong to sends and repeats, never sessions. Explicit companion tags group shared climbs. Read more expands a note; Show more expands loaded group entries. Links retain access to activities outside the API preview.",
      },
    },
  },
  args: { days: feedDays, view: "all" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <StoryPage title="Feed">
          <Story />
        </StoryPage>
      </div>
    ),
  ],
} satisfies Meta<typeof FeedTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActivityFeed: Story = {};
export const EdgeCases: Story = { args: { days: feedEdgeDays } };
export const SessionThenSend: Story = { args: { days: feedSessionHistory } };
export const PartialDays: Story = { args: { days: feedPartialDays } };
export const SendsOnly: Story = {
  args: {
    view: "sends",
    days: feedDays
      .map((day) => ({
        ...day,
        sessions: 0,
        repeats: 0,
        training: 0,
        activities: day.activities.filter((activity) => activity.kind === "send"),
      }))
      .filter((day) => day.sends > 0),
  },
};
