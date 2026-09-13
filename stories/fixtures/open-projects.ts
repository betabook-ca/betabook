import type { ProjectWithSessions } from "@/components/journal";
import type { JournalEntry } from "@/db/queries";

/** Sample open projects for the projects tab: one long-running boulder with
 * a note on every session, a sport route gone cold, and a trad line the
 * climber only logged dates for. Dates sit just before the gallery's fixed
 * clock so the "last out" labels stay readable. */

function entry(overrides: Partial<JournalEntry> & { id: number; climbId: number }): JournalEntry {
  return {
    kind: "session",
    sent: false,
    entryDate: "2026-09-01",
    body: null,
    tags: [],
    companions: [],
    climbName: null,
    climbType: "boulder",
    climbGrade: null,
    areaId: null,
    areaName: null,
    isAscent: false,
    isSendComment: false,
    ...overrides,
  };
}

export const moonSlab: ProjectWithSessions = {
  climbId: 101,
  climbName: "Moonlight Arete",
  climbType: "boulder",
  climbGrade: 8,
  areaId: 11,
  areaName: "Cedar Block",
  sessionCount: 9,
  noteCount: 7,
  firstSession: "2026-04-18",
  lastSession: "2026-09-04",
  sessions: [
    entry({
      id: 901,
      climbId: 101,
      entryDate: "2026-09-04",
      body: "Held the crux hold twice. The heel only stays if I drop the left hip first — that is the whole move.",
      tags: ["beta", "heels"],
      companions: [{ id: "sample-sam", name: "Sam Ortega", isSelf: false }],
    }),
    entry({
      id: 902,
      climbId: 101,
      entryDate: "2026-08-27",
      body: "Cold and dry. Linked from the sit to the jug, then nothing left in the fingers.",
      tags: ["conditions"],
    }),
    entry({
      id: 903,
      climbId: 101,
      entryDate: "2026-08-19",
      body: "Brushed the top out and found a knee scum nobody uses. Worth trying rested.",
    }),
  ],
};

export const riverRoute: ProjectWithSessions = {
  climbId: 102,
  climbName: "River Runs Red",
  climbType: "sport",
  climbGrade: 21,
  areaId: 12,
  areaName: "Granite Amphitheatre",
  sessionCount: 4,
  noteCount: 2,
  firstSession: "2026-05-30",
  lastSession: "2026-07-02",
  sessions: [
    entry({
      id: 904,
      climbId: 102,
      climbType: "sport",
      entryDate: "2026-07-02",
      body: "Fell at the third bolt twice. Too hot to try again after noon.",
      tags: ["endurance"],
    }),
    entry({ id: 905, climbId: 102, climbType: "sport", entryDate: "2026-06-21" }),
  ],
};

export const ashCrack: ProjectWithSessions = {
  climbId: 103,
  climbName: "Ash Crack",
  climbType: "trad",
  climbGrade: 14,
  areaId: 12,
  areaName: "Granite Amphitheatre",
  sessionCount: 2,
  noteCount: 0,
  firstSession: "2026-08-08",
  lastSession: "2026-08-30",
  sessions: [
    entry({ id: 906, climbId: 103, climbType: "trad", entryDate: "2026-08-30" }),
    entry({ id: 907, climbId: 103, climbType: "trad", entryDate: "2026-08-08" }),
  ],
};

export const openProjects: ProjectWithSessions[] = [moonSlab, ashCrack, riverRoute];
