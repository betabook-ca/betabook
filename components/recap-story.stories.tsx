import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { BOULDER_HUECO } from "@/lib/grades";
import type { RecapSnapshot } from "@/lib/recap-share";

import { RecapStory } from "./recap-story";

const snapshot: RecapSnapshot = {
  version: 1,
  createdAt: "2026-09-20T12:00:00.000Z",
  owner: { name: "Alex Rivera", initials: "AR" },
  stats: {
    period: "year",
    periodLabel: "2026",
    sendCount: 112,
    daysOut: 149,
    longestStreak: 11,
    firstTryPct: 42,
    busiestMonth: { month: "2026-09", count: 24 },
    calendar: {
      year: 2026,
      throughDate: "2026-09-20",
      highlightMonth: null,
      label: "2026 TO DATE",
      counts: { "2026-09-01": 2 },
    },
    breakthroughs: [
      { type: "boulder", grade: "V7", climbName: "Greedy Creator", dateSent: "2026-09-10" },
      {
        type: "sport",
        grade: "5.12c",
        climbName: "The Flyin' Hawaiian Road to Nowhere",
        dateSent: "2026-08-20",
      },
      {
        type: "boulder",
        grade: "V5",
        climbName: "The Big Traverse Across the Valley",
        dateSent: "2026-04-12",
      },
      { type: "trad", grade: "5.10d", climbName: "North Ridge", dateSent: "2026-02-04" },
    ],
    highlights: [
      {
        id: "partner",
        label: "Favorite partner",
        value: "Sam Chen",
        detail: "14 shared days",
      },
      {
        id: "mostSessioned",
        label: "Most sessioned climb",
        value: "The Flyin' Hawaiian Road to Nowhere",
        detail: "12 sessions",
      },
      {
        id: "busiestDay",
        label: "Most sessions in a day",
        value: "6 sessions",
        detail: "Sep 20, 2026",
      },
      {
        id: "persistence",
        label: "Persistence paid off",
        value: "Greedy Creator",
        detail: "8 sessions through the send",
      },
    ],
    favoriteClimbs: [
      { climbId: 1, climbName: "Greedy Creator", type: "boulder", rating: 5, grade: "V7" },
      {
        climbId: 4,
        climbName: "The Flyin' Hawaiian Road to Nowhere",
        type: "sport",
        rating: 5,
        grade: "5.12c",
      },
      { climbId: 5, climbName: "Skyline", type: "sport", rating: 5, grade: "5.11d" },
      { climbId: 6, climbName: "North Ridge", type: "trad", rating: 5, grade: "5.10d" },
      {
        climbId: 2,
        climbName: "The Big Traverse Across the Valley",
        type: "boulder",
        rating: 5,
        grade: "V5",
      },
      { climbId: 3, climbName: "Forest Warmup", type: "boulder", rating: 4, grade: "V3" },
    ],
    disciplines: [
      {
        type: "boulder",
        sendCount: 43,
        hardest: { climbId: 1, grade: "V7", climbName: "Greedy Creator" },
        favorites: [
          { climbId: 1, climbName: "Greedy Creator", rating: 5, grade: "V7" },
          { climbId: 2, climbName: "The Big Traverse Across the Valley", rating: 5, grade: "V5" },
          { climbId: 3, climbName: "Forest Warmup", rating: 4, grade: "V3" },
        ],
      },
      {
        type: "sport",
        sendCount: 51,
        hardest: { climbId: 4, grade: "5.12c", climbName: "The Flyin' Hawaiian Road to Nowhere" },
        favorites: [
          {
            climbId: 4,
            climbName: "The Flyin' Hawaiian Road to Nowhere",
            rating: 5,
            grade: "5.12c",
          },
          { climbId: 5, climbName: "Skyline", rating: 5, grade: "5.11d" },
        ],
      },
      {
        type: "trad",
        sendCount: 18,
        hardest: { climbId: 6, grade: "5.10d", climbName: "North Ridge" },
        favorites: [{ climbId: 6, climbName: "North Ridge", rating: 5, grade: "5.10d" }],
      },
    ],
  },
};

const LONG_HISTORY_CLIMBS = [
  "Midnight Traverse",
  "Granite Dreams",
  "The Long Way Home",
  "Paper Tigers",
  "High Country",
  "No Hands Required",
  "The Big Squeeze",
  "After the Rain",
  "First Light",
  "Quiet Storm",
  "Stone Garden",
  "Warmup Arete",
] as const;

const meta = {
  title: "Components/Analytics/Linked recap story",
  component: RecapStory,
  args: {
    snapshot,
    profilePath: "/users/alex",
  },
} satisfies Meta<typeof RecapStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Cover: Story = {};
export const Breakthroughs: Story = { args: { initialPage: 1 } };
export const SixBreakthroughs: Story = {
  args: {
    snapshot: {
      ...snapshot,
      stats: {
        ...snapshot.stats,
        breakthroughs: [
          ...(snapshot.stats.breakthroughs ?? []),
          { type: "boulder", grade: "V4", climbName: "First Highball", dateSent: "2026-01-15" },
          { type: "sport", grade: "5.11a", climbName: "First Lead", dateSent: "2026-01-01" },
        ],
      },
    },
    initialPage: 1,
  },
};
export const ThirteenBreakthroughs: Story = {
  args: {
    snapshot: {
      ...snapshot,
      stats: {
        ...snapshot.stats,
        breakthroughs: [
          {
            type: "sport",
            grade: "5.12c",
            climbName: "Sport high point",
            dateSent: "2026-12-02",
          },
          ...BOULDER_HUECO.slice(1, 13)
            .toReversed()
            .map((grade, index) => ({
              type: "boulder" as const,
              grade,
              climbName: LONG_HISTORY_CLIMBS[index],
              dateSent: `2026-${String(12 - index).padStart(2, "0")}-01`,
            })),
        ],
      },
    },
    initialPage: 1,
  },
};
export const Highlights: Story = { args: { initialPage: 2 } };
export const FavoriteClimbs: Story = { args: { initialPage: 3 } };

export const OneDisciplineCover: Story = {
  args: {
    snapshot: {
      ...snapshot,
      stats: {
        ...snapshot.stats,
        breakthroughs: [],
        highlights: [],
        favoriteClimbs: [],
        disciplines: snapshot.stats.disciplines.slice(0, 1),
      },
    },
    initialPage: 0,
  },
};
