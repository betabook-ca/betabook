import type { AnalyticsSendRow } from "@/db/queries";
import type { FeedDay } from "@/db/queries/feed";
import { goalTitle, type GoalProgress } from "@/lib/goals";
import { nativeGradeArray } from "@/lib/grades";
import { buildUserAnalytics } from "@/lib/user-analytics";

/** Fictional, browser-only tutorial data. These IDs must never be used in links or writes. */
const DEMO_AREA = "Pine Canyon";

const climbs = {
  warmup: { id: -1, name: "First Light", grade: "V2" },
  sent: { id: -2, name: "Quiet Arete", grade: "V4" },
  flash: { id: -3, name: "Moss Ladder", grade: "V3" },
  project: { id: -4, name: "The Long Way", grade: "V5" },
} as const;

export const TOUR_DEMO_PEOPLE = { search: "Riley Chen", requester: "Sam Taylor" };

export const TOUR_DEMO_SEARCH_RESULTS = {
  climb: { name: climbs.sent.name, detail: climbs.sent.grade },
  area: { name: DEMO_AREA, detail: "Climbing area" },
  climber: { name: TOUR_DEMO_PEOPLE.search, detail: "Member profile" },
};

/** The Find climbs lesson's sample area; a negative ID that never reaches a link. */
export const TOUR_DEMO_AREA = { id: -10, name: DEMO_AREA, path: "Sample Range" };

export type TourDemoClimb = {
  id: number;
  name: string;
  type: "boulder" | "sport" | "trad";
  /** Ordinal on the discipline's native scale, as the catalog stores it. */
  grade: number | null;
  avgRating: number | null;
  sendCount: number;
  sent: boolean;
};

const ordinal = (type: TourDemoClimb["type"], label: string) =>
  nativeGradeArray(type).indexOf(label);

/** Pine Canyon's catalog for browsing by area, discipline, grade, rating and
 * ascents. Alex has sent two; the rest are candidates for a project. */
export const TOUR_DEMO_CLIMBS: readonly TourDemoClimb[] = [
  {
    ...climbs.project,
    type: "boulder",
    grade: ordinal("boulder", "V5"),
    avgRating: 4.6,
    sendCount: 18,
    sent: false,
  },
  {
    ...climbs.sent,
    type: "boulder",
    grade: ordinal("boulder", "V4"),
    avgRating: 4.2,
    sendCount: 31,
    sent: true,
  },
  {
    ...climbs.flash,
    type: "boulder",
    grade: ordinal("boulder", "V3"),
    avgRating: 3.4,
    sendCount: 12,
    sent: true,
  },
  {
    ...climbs.warmup,
    type: "boulder",
    grade: ordinal("boulder", "V2"),
    avgRating: 2.8,
    sendCount: 44,
    sent: false,
  },
  {
    id: -5,
    name: "Canyon Corner",
    type: "sport",
    grade: ordinal("sport", "5.10b"),
    avgRating: 4.0,
    sendCount: 26,
    sent: false,
  },
  {
    id: -6,
    name: "Pine Needle Crack",
    type: "trad",
    grade: ordinal("trad", "5.8"),
    avgRating: 3.9,
    sendCount: 9,
    sent: false,
  },
  {
    id: -7,
    name: "Shaded Traverse",
    type: "boulder",
    grade: null,
    avgRating: null,
    sendCount: 0,
    sent: false,
  },
];

export const TOUR_DEMO_FRIEND_DAY = {
  name: TOUR_DEMO_PEOPLE.requester,
  date: "2026-03-14",
  entries: [
    {
      id: "friend-send",
      kind: "send",
      ascentStyle: "flash",
      climb: climbs.flash,
      note: "Flashed it. The right heel hook helped.",
    },
    {
      id: "friend-session",
      kind: "session",
      ascentStyle: null,
      climb: climbs.project,
      note: "Kept the left foot on through the crux.",
    },
    {
      id: "friend-training",
      kind: "training",
      ascentStyle: null,
      climb: null,
      note: "Easy mobility after climbing.",
    },
  ],
} as const;

type DemoEntry = {
  id: string;
  date: string;
  kind: "session" | "training";
  outcome: "Session" | "Sent" | "Repeat" | "Training";
  climb: (typeof climbs)[keyof typeof climbs] | null;
  note: string;
  tags: string[];
  rating?: number;
  style?: "flash" | "redpoint";
};

export const TOUR_DEMO_ENTRIES: readonly DemoEntry[] = [
  {
    id: "project-two",
    date: "2026-03-14",
    kind: "session",
    outcome: "Session",
    climb: climbs.project,
    note: "Linked the start. Next time: keep the left heel on for the crux.",
    tags: ["footwork", "project"],
  },
  {
    id: "training",
    date: "2026-03-13",
    kind: "training",
    outcome: "Training",
    climb: null,
    note: "Silent-feet drills at the gym, then easy endurance laps.",
    tags: ["footwork"],
  },
  {
    id: "project-one",
    date: "2026-03-12",
    kind: "session",
    outcome: "Session",
    climb: climbs.project,
    note: "Found the holds but couldn't link the crux.",
    tags: ["project"],
  },
  {
    id: "repeat",
    date: "2026-03-12",
    kind: "session",
    outcome: "Repeat",
    climb: climbs.sent,
    note: "Repeated it with quieter feet. The high step feels easier now.",
    tags: ["footwork"],
  },
  {
    id: "flash",
    date: "2026-03-12",
    kind: "session",
    outcome: "Sent",
    climb: climbs.flash,
    note: "Read the sequence from the ground and flashed it.",
    tags: [],
    rating: 5,
    style: "flash",
  },
  {
    id: "send",
    date: "2026-02-15",
    kind: "session",
    outcome: "Sent",
    climb: climbs.sent,
    note: "Finally stuck the high step after working the sequence.",
    tags: ["footwork"],
    rating: 4,
    style: "redpoint",
  },
  {
    id: "strength",
    date: "2026-02-14",
    kind: "training",
    outcome: "Training",
    climb: null,
    note: "Pull-ups and core work. Kept it light before tomorrow's session.",
    tags: ["strength"],
  },
  {
    id: "warmup",
    date: "2026-01-10",
    kind: "session",
    outcome: "Sent",
    climb: climbs.warmup,
    note: "A good first climb of the year.",
    tags: [],
    rating: 3,
    style: "redpoint",
  },
];

export const TOUR_DEMO_SENDS = TOUR_DEMO_ENTRIES.flatMap((entry) => {
  if (entry.outcome !== "Sent" || !entry.climb) return [];
  return [
    {
      climbId: entry.climb.id,
      climbName: entry.climb.name,
      climbType: "boulder" as const,
      suggestedGrade: nativeGradeArray("boulder").indexOf(entry.climb.grade),
      areaId: -1,
      areaName: DEMO_AREA,
      ascentStyle: entry.style ?? "redpoint",
      dateSent: entry.date,
      rating: entry.rating ?? 0,
      note: entry.note,
    } satisfies AnalyticsSendRow & { rating: number; note: string },
  ];
});

export const TOUR_DEMO_PROJECT = {
  ...climbs.project,
  sessions: TOUR_DEMO_ENTRIES.filter((entry) => entry.climb?.id === climbs.project.id),
};

export const TOUR_DEMO_ANALYTICS = buildUserAnalytics(
  TOUR_DEMO_SENDS,
  "boulder",
  TOUR_DEMO_ENTRIES.filter((entry) => entry.kind === "session").map((entry) => ({
    entryDate: entry.date,
    climbType: "boulder",
  })),
);

/** Filter the whole sample journal before limiting the rows shown in a lesson. */
export function getTourDemoJournalPage({
  kind,
  query,
  tag,
  showAll,
}: {
  kind: "session" | "training" | null;
  query: string;
  tag: string | null;
  showAll: boolean;
}) {
  const search = query.toLowerCase().trim();
  const matches = TOUR_DEMO_ENTRIES.filter(
    (entry) =>
      (kind === null || entry.kind === kind) &&
      (tag === null || entry.tags.includes(tag)) &&
      entry.note.toLowerCase().includes(search),
  );
  return { matches, visible: showAll ? matches : matches.slice(0, 3) };
}

export const TOUR_DEMO_GOAL: GoalProgress = {
  id: -101,
  userId: "demo-alex",
  kind: "training",
  target: 2,
  discipline: null,
  grade: null,
  tags: ["hangboard", "strength"],
  timeframe: "month",
  repeat: "none",
  timezone: "UTC",
  startDate: "2026-03-01",
  endDate: "2026-03-31",
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  progress: 0,
  completedDate: null,
};

export function getTourDemoGoalProgress(entries: readonly { tags: string[] }[]): GoalProgress {
  const progress = entries.filter((entry) =>
    TOUR_DEMO_GOAL.tags?.every((tag) => entry.tags.includes(tag)),
  ).length;
  return {
    ...TOUR_DEMO_GOAL,
    progress,
    completedDate: progress >= TOUR_DEMO_GOAL.target ? "2026-03-14" : null,
  };
}

export const TOUR_DEMO_GOAL_FEED: FeedDay = {
  userId: "demo-alex",
  name: "Alex Morgan",
  image: null,
  date: "2026-03-14",
  journalVisible: true,
  sends: 0,
  repeats: 0,
  sessions: 0,
  training: 0,
  goals: 1,
  activities: [
    {
      id: -101,
      kind: "goal",
      goalTitle: goalTitle(TOUR_DEMO_GOAL),
      climbId: null,
      climbName: null,
      climbType: null,
      climbGrade: null,
      reportedGrade: null,
      gradeFeel: null,
      areaId: null,
      areaName: null,
      ascentStyle: null,
      body: null,
    },
  ],
};
