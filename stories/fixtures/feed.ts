import type { FeedDay } from "@/db/queries/feed";
import type { FeedEntry } from "@/lib/feed-groups";
import { feedStoryClimbs } from "@/stories/fixtures/feed-climbs";

const day: FeedDay = {
  userId: "alex",
  name: "Alex Rivera",
  image: null,
  date: "2026-09-13",
  journalVisible: true,
  sends: 0,
  repeats: 0,
  sessions: 1,
  training: 0,
  goals: 0,
  activities: [],
};
const activity: FeedEntry["activity"] = {
  ...feedStoryClimbs[0],
  id: 1,
  kind: "session",
  reportedGrade: null,
  gradeFeel: null,
  ascentStyle: null,
  body: "Painfully close! Fun session watching Jordan send second go.",
};

function entry(
  id: number,
  name: string,
  changes: Partial<FeedEntry["activity"]>,
  date = day.date,
): FeedEntry {
  const item = { ...activity, ...changes, id };
  return {
    day: {
      ...day,
      userId: name.toLowerCase().replaceAll(" ", "-"),
      name,
      date,
      sends: Number(item.kind === "send"),
      sessions: Number(item.kind === "session"),
      repeats: Number(item.kind === "repeat"),
      training: Number(item.kind === "training"),
      activities: [item],
    },
    activity: item,
  };
}

const groups: FeedEntry[][] = [
  [
    entry(1, "Alex Rivera", {}),
    entry(2, "Jordan Lee", {
      kind: "send",
      ascentStyle: "redpoint",
      reportedGrade: 6,
      gradeFeel: "high",
      body: "Finally linked it! The high foot made all the difference.",
    }),
  ],
  [
    entry(3, "Sam Okafor", {
      ...feedStoryClimbs[1],
      kind: "send",
      ascentStyle: "flash",
      reportedGrade: 4,
      body: "Quick one two step up.",
    }),
  ],
  [
    entry(
      4,
      "Alex Rivera",
      {
        ...feedStoryClimbs[2],
        kind: "send",
        ascentStyle: "redpoint",
        reportedGrade: 7,
        gradeFeel: "low",
        body: "Hard as expected. A lot of micro beta to link into the finish. Moving the foot one inch made a huge difference. Big thanks to Jordan for the support while I was working it out. Ready to come back and try the next line.",
        companions: [{ id: "jordan-lee", name: "Jordan Lee", isSelf: false }],
      },
      "2026-09-12",
    ),
  ],
  [
    entry(
      5,
      "Jordan Lee",
      {
        ...feedStoryClimbs[1],
        kind: "repeat",
        reportedGrade: 4,
        body: "A few laps to finish the day.",
      },
      "2026-09-12",
    ),
  ],
];

const edgeGroups: FeedEntry[][] = [
  [
    entry(10, "Alex Rivera", {
      kind: "send",
      ascentStyle: "redpoint",
      reportedGrade: 6,
      gradeFeel: "high",
      body: null,
    }),
    entry(11, "Jordan Lee", {
      body: "Still working the last move.",
    }),
    entry(12, "Sam Okafor", {
      kind: "repeat",
      reportedGrade: 4,
      gradeFeel: "low",
      body: "A different sequence this time.",
    }),
  ],
  [
    entry(13, "A climber with a considerably longer display name", {
      climbName: "A very long traverse from the cedar tree to the far end of the upper wall",
      kind: "send",
      ascentStyle: null,
      reportedGrade: null,
      body: null,
    }),
  ],
  [
    entry(14, "Sam Okafor", {
      climbType: "sport",
      climbGrade: 10,
      climbName: "Morning Light",
      kind: "send",
      ascentStyle: "onsight",
      reportedGrade: 10,
      body: "A perfect warm-up in the sun.",
    }),
  ],
  [
    entry(16, "Alex Rivera", {
      ...feedStoryClimbs[2],
      kind: "send",
      ascentStyle: "redpoint",
      reportedGrade: 8,
      body: null,
    }),
  ],
  [
    entry(
      15,
      "Jordan Lee",
      {
        kind: "training",
        climbId: null,
        climbName: null,
        climbType: null,
        climbGrade: null,
        areaId: null,
        areaName: null,
        areaAncestors: [],
        body: "Mobility, light fingerboard work, and shoulder exercises.",
      },
      "2026-09-12",
    ),
  ],
];

const sessionHistory: FeedEntry[][] = [
  [
    entry(
      20,
      "Jordan Lee",
      {
        kind: "send",
        ascentStyle: "redpoint",
        reportedGrade: 6,
        gradeFeel: "high",
        body: "Linked it today. A grade harder than posted for me.",
      },
      "2026-09-14",
    ),
  ],
  [
    entry(
      21,
      "Jordan Lee",
      {
        body: "Still working the last move.",
      },
      "2026-09-13",
    ),
  ],
];

// Compose API-shaped days so stories exercise production grouping, including explicit companion tags.
function toDays(groups: FeedEntry[][]): FeedDay[] {
  const days = new Map<string, FeedDay>();
  for (const group of groups)
    for (const entry of group) {
      const key = `${entry.day.date}:${entry.day.userId}`;
      const current = days.get(key) ?? {
        ...entry.day,
        sends: 0,
        sessions: 0,
        repeats: 0,
        training: 0,
        goals: 0,
        activities: [],
      };
      const companions =
        group.length > 1
          ? group
              .filter((other) => other.day.userId !== entry.day.userId)
              .map((other) => ({ id: other.day.userId, name: other.day.name, isSelf: false }))
          : entry.activity.companions;
      current.activities.push({ ...entry.activity, companions });
      const field = {
        send: "sends",
        session: "sessions",
        repeat: "repeats",
        training: "training",
        goal: "goals",
      } as const;
      current[field[entry.activity.kind]] = current[field[entry.activity.kind]] + 1;
      days.set(key, current);
    }
  return [...days.values()];
}
export const feedDays = toDays(groups);
export const feedEdgeDays = toDays(edgeGroups);
export const feedSessionHistory = toDays(sessionHistory);
export const feedPartialDays = [
  { ...feedDays[0], sessions: 4, training: 1 },
  feedDays[1],
  { ...feedDays[2], date: "2026-09-12", sends: 0, training: 2, activities: [] },
];
