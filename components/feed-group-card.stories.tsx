import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { FeedDay } from "@/db/queries/feed";
import type { FeedCard } from "@/lib/feed-groups";
import { feedStoryClimbs } from "@/stories/fixtures/feed-climbs";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeedGroupCard } from "./feed-group-card";

const meta = {
  title: "Components/Journal/Feed group card",
  component: FeedGroupCard,
} satisfies Meta<typeof FeedGroupCard>;
export default meta;
type Story = StoryObj;
const base: FeedDay = {
  userId: "alex",
  name: "Alex Rivera",
  image: null,
  date: "2026-09-02",
  journalVisible: true,
  sends: 0,
  repeats: 0,
  sessions: 1,
  training: 0,
  activities: [],
};
const activity: FeedDay["activities"][number] = {
  id: 1,
  kind: "session",
  ...feedStoryClimbs[0],
  reportedGrade: null,
  gradeFeel: null,
  ascentStyle: null,
  body: "Worked the opening moves with Jordan.",
  companions: [{ id: "jordan", name: "Jordan Lee", isSelf: false }],
};
const group: Extract<FeedCard, { kind: "group" }> = {
  kind: "group",
  key: "sample",
  date: base.date,
  entryKind: "climb",
  entries: [
    {
      day: { ...base, sends: 1, sessions: 0 },
      activity: {
        ...activity,
        kind: "send",
        ascentStyle: "redpoint",
        reportedGrade: 6,
        gradeFeel: "high",
      },
    },
    {
      day: { ...base, userId: "jordan", name: "Jordan Lee" },
      activity: {
        ...activity,
        id: 2,
        body: "Found a comfortable high foot.",
        companions: [{ id: "alex", name: "Alex Rivera", isSelf: false }],
      },
    },
  ],
};
export const SharedClimb: Story = {
  render: () => (
    <StoryPage
      title="Shared climb in the feed"
      description="Both friends tagged each other. Alex redpointed and called it V5, hard for the grade. Jordan's session falls back to the climb's posted V4, greyed out, because Jordan has never reported a grade here."
    >
      <FeedGroupCard group={group} />
    </StoryPage>
  ),
};
const disagreeingClimbers: (Pick<FeedDay["activities"][number], "reportedGrade" | "gradeFeel"> & {
  name: string;
})[] = [
  { name: "Alex Rivera", reportedGrade: 6, gradeFeel: "high" },
  { name: "Jordan Lee", reportedGrade: 5, gradeFeel: "solid" },
  { name: "Sam Okafor", reportedGrade: 4, gradeFeel: "low" },
];
export const DisagreeingGrades: Story = {
  render: () => (
    <StoryPage
      title="One climb, three opinions"
      description="Each row keeps the grade its own climber reported, with the arrow showing how the climb felt to them."
    >
      <FeedGroupCard
        group={{
          ...group,
          entries: disagreeingClimbers.map(({ name, reportedGrade, gradeFeel }, index) => ({
            day: { ...base, userId: `climber-${index}`, name, sends: 1, sessions: 0 },
            activity: {
              ...activity,
              id: index + 1,
              kind: "send",
              ascentStyle: "redpoint",
              reportedGrade,
              gradeFeel,
              body: null,
            },
          })),
        }}
      />
    </StoryPage>
  ),
};
export const ConnectedTraining: Story = {
  render: () => (
    <StoryPage title="Training updates">
      <FeedGroupCard
        group={{
          ...group,
          entryKind: "training",
          entries: group.entries.map((e) => ({
            ...e,
            day: { ...e.day, sends: 0, sessions: 0, training: 1 },
            activity: {
              ...e.activity,
              kind: "training",
              climbId: null,
              climbName: null,
              climbType: null,
              climbGrade: null,
              areaId: null,
              areaName: null,
              areaAncestors: [],
              ascentStyle: null,
              body: `${e.day.name}'s mobility and strength work.`,
            },
          })),
        }}
      />
    </StoryPage>
  ),
};
export const LargeGroup: Story = {
  render: () => (
    <StoryPage
      title="A busy session"
      description="Hover or focus 7 others to see the remaining authors."
    >
      <FeedGroupCard
        group={{
          ...group,
          entries: Array.from({ length: 8 }, (_, index) => ({
            day: {
              ...base,
              userId: `friend-${index}`,
              name: `Climbing friend ${index + 1} with a long name`,
              sends: Number(index % 3 === 0),
              repeats: Number(index % 3 === 1),
              sessions: Number(index % 3 === 2),
            },
            activity: {
              ...activity,
              id: index + 1,
              kind: index % 3 === 0 ? "send" : index % 3 === 1 ? "repeat" : "session",
              ascentStyle: index % 3 === 0 ? "flash" : null,
              reportedGrade: 4 + (index % 3),
              gradeFeel: index % 3 === 0 ? "high" : "solid",
              body: `Notes from climber ${index + 1}.`,
              companions:
                index < 7
                  ? [
                      {
                        id: `friend-${index + 1}`,
                        name: `Climbing friend ${index + 2} with a long name`,
                        isSelf: false,
                      },
                    ]
                  : [],
            },
          })),
        }}
      />
    </StoryPage>
  ),
};
