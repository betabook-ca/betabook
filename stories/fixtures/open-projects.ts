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
    climbBrokenOn: null,
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
  climbBrokenOn: null,
  areaId: 11,
  areaName: "Cedar Block",
  sessionCount: 9,
  noteCount: 7,
  pinnedAt: "2026-04-18",
  firstSession: "2026-04-18",
  lastSession: "2026-09-04",
  sentOn: null,
  sent: false,
  share: null,
  sessions: [
    entry({
      id: 901,
      climbId: 101,
      entryDate: "2026-09-04",
      body: "Held the crux hold twice. The heel only stays if I drop the left hip first — that is the whole move.",
      tags: ["beta", "heels"],
      companions: [{ id: "sample-sam", name: "Sam Ortega", image: null, isSelf: false }],
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
  climbBrokenOn: null,
  areaId: 12,
  areaName: "Granite Amphitheatre",
  sessionCount: 4,
  noteCount: 2,
  pinnedAt: "2026-05-30",
  firstSession: "2026-05-30",
  lastSession: "2026-07-02",
  sentOn: null,
  sent: false,
  share: null,
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
  climbBrokenOn: null,
  areaId: 12,
  areaName: "Granite Amphitheatre",
  sessionCount: 2,
  noteCount: 0,
  pinnedAt: "2026-08-08",
  firstSession: "2026-08-08",
  lastSession: "2026-08-30",
  sentOn: null,
  sent: false,
  share: null,
  sessions: [
    entry({ id: 906, climbId: 103, climbType: "trad", entryDate: "2026-08-30" }),
    entry({ id: 907, climbId: 103, climbType: "trad", entryDate: "2026-08-08" }),
  ],
};

/** Pinned but never touched — the state a climber creates by pinning a climb
 * off a guidebook before their first session on it. Nothing to date, nothing
 * to summarize; the card is the climb and the pin. */
export const untouchedPin: ProjectWithSessions = {
  climbId: 104,
  climbName: "Sleeping Giant",
  climbType: "boulder",
  climbGrade: 10,
  climbBrokenOn: null,
  areaId: 11,
  areaName: "Cedar Block",
  sessionCount: 0,
  noteCount: 0,
  pinnedAt: "2026-09-10",
  firstSession: null,
  lastSession: null,
  sentOn: null,
  sent: false,
  share: null,
  sessions: [],
};

/** A pin that made it: sent, so it lists under Sent Projects rather than
 * vanishing, and keeps the sessions it took to get there. */
export const sentPin: ProjectWithSessions = {
  climbId: 105,
  climbName: "The Long Winter",
  climbType: "sport",
  climbGrade: 23,
  climbBrokenOn: null,
  areaId: 12,
  areaName: "Granite Amphitheatre",
  sessionCount: 6,
  noteCount: 1,
  pinnedAt: "2026-03-02",
  firstSession: "2026-03-02",
  lastSession: "2026-08-15",
  sentOn: "2026-08-15",
  sent: true,
  share: null,
  sessions: [
    entry({
      id: 908,
      climbId: 105,
      climbType: "sport",
      entryDate: "2026-08-15",
      body: "Clipped the chains. Six sessions and the right shoe finally stuck on the slab.",
      tags: ["send"],
    }),
  ],
};

export const openProjects: ProjectWithSessions[] = [moonSlab, ashCrack, riverRoute, untouchedPin];

export const sentProjects: ProjectWithSessions[] = [sentPin];

/** A live link beside an unshared project, so the gallery shows both states of
 * the control. The chip prints the deadline as a date, so it reads the same in
 * every capture whatever the gallery's clock says. */
export const sharedProjects: ProjectWithSessions[] = [
  {
    ...moonSlab,
    share: { token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36", expiresAt: "2026-10-06 12:00:00" },
  },
  ashCrack,
];
