import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import type { FeedDay } from "@/db/queries/feed";
import { feedStoryClimbs } from "@/stories/fixtures/feed-climbs";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeedDayCard } from "./feed-day-card";

const meta = { title: "Components/Journal/Feed day card", component: FeedDayCard } satisfies Meta<
  typeof FeedDayCard
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
const day: FeedDay = {
  userId: "storybook-climber",
  name: "Alex Rivera",
  image: null,
  date: "2026-09-01",
  journalVisible: true,
  sends: 1,
  repeats: 1,
  sessions: 0,
  training: 1,
  activities: [
    {
      id: 1,
      kind: "send",
      ...feedStoryClimbs[0],
      reportedGrade: 6,
      gradeFeel: "high",
      ascentStyle: "flash",
      body: "Linked the moves with a high right foot.",
    },
    {
      id: 2,
      kind: "training",
      climbId: null,
      climbName: null,
      climbType: null,
      climbGrade: null,
      reportedGrade: null,
      gradeFeel: null,
      areaId: null,
      areaName: null,
      ascentStyle: null,
      body: "Easy movement practice and a short hangboard session.",
      companions: [{ id: "storybook-partner", name: "Jordan Lee", isSelf: false }],
    },
    {
      id: 3,
      kind: "repeat",
      ...feedStoryClimbs[1],
      reportedGrade: 4,
      gradeFeel: "low",
      ascentStyle: null,
      body: "Repeated it with a smoother sequence.",
    },
  ],
};
export const ActivityFeed: Story = {
  render: () => (
    <StoryPage
      title="Activity feed"
      description="A complete day with a flash, training, and a repeat."
    >
      <FeedDayCard day={day} view="all" />
    </StoryPage>
  ),
};
const sendActivities: FeedDay["activities"] = feedStoryClimbs.map((climb, index) => ({
  ...day.activities[0],
  ...climb,
  id: index + 1,
  ascentStyle: index === 0 ? "flash" : "redpoint",
  reportedGrade: index === 2 ? null : climb.climbGrade + 1,
  gradeFeel: index === 0 ? "high" : "solid",
  body: index === 0 ? day.activities[0].body : null,
}));

function DayNavigationExample({
  title,
  preview,
  activities,
}: {
  title: string;
  preview: FeedDay;
  activities: FeedDay["activities"];
}) {
  const [showDay, setShowDay] = useState(false);
  const destination = `/users/${preview.userId}/journal?date=${preview.date}`;
  return (
    <div
      onClickCapture={(event) => {
        const link = event.target instanceof Element ? event.target.closest("a") : null;
        if (link?.getAttribute("href") !== destination) return;
        // Storybook has no profile routes. Handle the real card's day links
        // at the navigation boundary using only this story's complete fixture.
        event.preventDefault();
        setShowDay(true);
      }}
    >
      <StoryPage
        title={showDay ? `${preview.name}’s journal` : title}
        description={
          showDay
            ? "Sample day destination with all entries."
            : "See all activity opens a local preview of the complete day."
        }
      >
        {showDay && (
          <Button variant="ghost" className="self-start" onPress={() => setShowDay(false)}>
            Back to feed
          </Button>
        )}
        <FeedDayCard day={showDay ? { ...preview, activities } : preview} view="all" />
      </StoryPage>
    </div>
  );
}

export const MoreActivity: Story = {
  render: () => (
    <DayNavigationExample
      title="More from a mixed activity day"
      preview={{
        ...day,
        sends: 3,
        repeats: 0,
        training: 2,
        activities: [...sendActivities.slice(0, 2), day.activities[1]],
      }}
      activities={[
        ...sendActivities,
        day.activities[1],
        { ...day.activities[1], id: 4, body: "Finished with shoulder mobility and stretching." },
      ]}
    />
  ),
};

export const RemainingActivity: Story = {
  render: () => (
    <DayNavigationExample
      title="Activity remaining after grouping"
      preview={{ ...day, sends: 0, repeats: 0, activities: [] }}
      activities={[day.activities[1]]}
    />
  ),
};

export const SendsOnly: Story = {
  render: () => (
    <StoryPage
      title="Member-visible sends with a hidden journal"
      description="Already-authorized send facts link to Sends when the author's journal is unavailable. This fixture does not test server authorization."
    >
      <FeedDayCard
        view="sends"
        day={{
          ...day,
          journalVisible: false,
          sends: 3,
          repeats: 0,
          training: 0,
          activities: [
            {
              ...sendActivities[0],
              companions: [{ id: "sample-partner", name: "Jordan Lee", isSelf: false }],
            },
          ],
        }}
      />
    </StoryPage>
  ),
};
