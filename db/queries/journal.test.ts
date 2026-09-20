import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import {
  getAscentEntryId,
  getJournalEntry,
  getJournalForClimb,
  getJournalPage,
  getJournalSessionsForAnalytics,
  getOpenProjectSuggestions,
  getPinnedProjects,
  getPinnedProjectSessions,
  hasJournalEntries,
} from "@/db/queries";
import { sends } from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER, type JournalFilter } from "@/lib/filters/journal-filter";
import {
  seedFixtureJournalEntry,
  seedFixturePinnedProject,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

let db: Database;

const OWNER_ID = "tl-owner";

const HIGHBALL = 1; // from seedFixtureTree
const SLAB = 2;
const CRIMPER = 3;

function filter(overrides: Partial<JournalFilter> = {}): JournalFilter {
  return { ...DEFAULT_JOURNAL_FILTER, ...overrides };
}

beforeEach(async () => {
  db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER_ID, name: "Timeline Owner" });
  await seedFixtureUser(db, { id: "tl-other", name: "Someone Else" });

  await seedFixtureSend(db, {
    userId: OWNER_ID,
    climbId: HIGHBALL,
    dateSent: "2025-01-10",
    comment: "Finally. 100% effort under_score.",
  });

  await seedFixtureJournalEntry(db, {
    userId: OWNER_ID,
    climbId: HIGHBALL,
    entryDate: "2025-01-10",
    sent: true,
    isAscent: true,
    body: "Finally. 100% effort under_score.",
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER_ID,
    climbId: HIGHBALL,
    entryDate: "2025-02-02",
    sent: true,
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER_ID,
    climbId: HIGHBALL,
    entryDate: "2025-02-02",
  });
  await seedFixtureJournalEntry(db, { userId: OWNER_ID, climbId: SLAB, entryDate: "2025-03-05" });
  await seedFixtureJournalEntry(db, { userId: OWNER_ID, climbId: SLAB, entryDate: "2025-03-06" });
  await seedFixtureJournalEntry(db, {
    userId: OWNER_ID,
    entryDate: "2025-04-01",
    kind: "training",
    body: "Hangboard.",
    tags: ["hangboard", "happy-boulders"],
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER_ID,
    entryDate: "2026-01-15",
    kind: "training",
    body: "Gym laps.",
  });

  await seedFixtureSend(db, { userId: "tl-other", climbId: CRIMPER, dateSent: "2026-02-01" });
  await seedFixtureJournalEntry(db, {
    userId: "tl-other",
    climbId: CRIMPER,
    entryDate: "2026-02-01",
    sent: true,
  });
});

describe("getJournalPage", () => {
  it("returns one user's entries, newest first", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter());
    expect(page.entries.map((e) => e.entryDate)).toEqual([
      "2026-01-15",
      "2025-04-01",
      "2025-03-06",
      "2025-03-05",
      "2025-02-02",
      "2025-02-02",
      "2025-01-10",
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("labels only the earliest sent session on a climb as the ascent", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ climbId: HIGHBALL }));
    expect(
      page.entries.filter((entry) => entry.sent).map((e) => [e.entryDate, e.isAscent]),
    ).toEqual([
      ["2025-02-02", false],
      ["2025-01-10", true],
    ]);
  });

  it("keeps indoor climbing as training without a climb", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter());
    const gymDay = page.entries.find((e) => e.entryDate === "2026-01-15");
    expect(gymDay).toMatchObject({
      kind: "training",
      climbId: null,
      climbName: null,
      areaName: null,
    });
  });

  it("joins the climb and area onto an attached entry", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ climbId: HIGHBALL }));
    expect(page.entries[0]).toMatchObject({
      climbName: "Test Highball",
      climbType: "boulder",
      areaName: "Test Highball Alcove",
    });
  });

  it("decodes tags, and gives an untagged entry an empty array", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ view: "training" }));
    expect(page.entries.find((entry) => entry.entryDate === "2025-04-01")?.tags).toEqual([
      "hangboard",
      "happy-boulders",
    ]);

    const sessions = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ view: "sessions" }));
    expect(sessions.entries[0]?.tags).toEqual([]);
  });

  it("filters by a hyphenated tag", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ tags: ["happy-boulders"] }));
    expect(page.entries.map((e) => e.entryDate)).toEqual(["2025-04-01"]);
  });

  it("returns nothing for a tag nobody used", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ tags: ["campus"] }));
    expect(page.entries).toEqual([]);
  });

  it.each([
    ["highball", "2025-01-10"],
    ["alcove", "2025-01-10"],
    ["finally", "2025-01-10"],
    ["hangboard", "2025-04-01"],
  ])("searches route, area, note, and tag text for %s", async (query, entryDate) => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ query }));
    expect(page.entries.some((entry) => entry.entryDate === entryDate)).toBe(true);
  });

  it.each(["boulders", "crag"])("searches ancestor area names for %s", async (query) => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ query, view: "sessions" }));
    expect(page.entries).toHaveLength(5);
    expect(page.entries.every((entry) => entry.kind === "session")).toBe(true);
  });

  it.each(["%", "_"])("treats %s as literal search text", async (query) => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ query }));
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ entryDate: "2025-01-10" });
  });

  it("accepts a multibyte query without creating an oversized LIKE pattern", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ query: "é".repeat(100) }));
    expect(page.entries).toEqual([]);
  });

  it("filters by year", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ year: 2026 }));
    expect(page.entries.map((e) => e.entryDate)).toEqual(["2026-01-15"]);
  });

  it("pages by cursor without repeating or skipping a same-day pair", async () => {
    const first = await getJournalPage(db, OWNER_ID, OWNER_ID, filter(), null, 5);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual({ entryDate: "2025-02-02", id: first.entries[4].id });

    const second = await getJournalPage(db, OWNER_ID, OWNER_ID, filter(), first.nextCursor, 5);
    const ids = [...first.entries, ...second.entries].map((e) => e.id);
    expect(first.entries.map((e) => [e.entryDate, e.sent])).toEqual([
      ["2026-01-15", false],
      ["2025-04-01", false],
      ["2025-03-06", false],
      ["2025-03-05", false],
      ["2025-02-02", false],
    ]);
    expect(second.entries.map((e) => [e.entryDate, e.sent])).toEqual([
      ["2025-02-02", true],
      ["2025-01-10", true],
    ]);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(second.nextCursor).toBeNull();
    expect(second.hasMore).toBe(false);
  });

  it("carries the cursor through a filter", async () => {
    const first = await getJournalPage(
      db,
      OWNER_ID,
      OWNER_ID,
      filter({ view: "sessions" }),
      null,
      1,
    );
    expect(first.entries.map((e) => e.entryDate)).toEqual(["2025-03-06"]);

    const second = await getJournalPage(
      db,
      OWNER_ID,
      OWNER_ID,
      filter({ view: "sessions" }),
      first.nextCursor,
      1,
    );
    expect(second.entries.map((e) => e.entryDate)).toEqual(["2025-03-05"]);
  });
});

describe("getJournalForClimb", () => {
  it("returns the owner's history on one climb, newest first", async () => {
    const entries = await getJournalForClimb(db, OWNER_ID, OWNER_ID, HIGHBALL);
    expect(entries).toHaveLength(3);
    expect(entries.at(-1)).toMatchObject({ entryDate: "2025-01-10", isAscent: true });
  });

  it("honours its limit", async () => {
    const entries = await getJournalForClimb(db, OWNER_ID, OWNER_ID, HIGHBALL, 1);
    expect(entries).toHaveLength(1);
  });

  it("is empty for a climb with no entries", async () => {
    expect(await getJournalForClimb(db, OWNER_ID, OWNER_ID, CRIMPER)).toEqual([]);
  });
});

describe("getJournalEntry", () => {
  it("returns the owner's own entry", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ year: 2026 }));
    const entry = await getJournalEntry(db, page.entries[0].id, OWNER_ID);
    expect(entry).toMatchObject({ body: "Gym laps." });
  });

  it("returns nothing for somebody else's entry, without a second check", async () => {
    const page = await getJournalPage(db, OWNER_ID, OWNER_ID, filter({ year: 2026 }));
    expect(await getJournalEntry(db, page.entries[0].id, "tl-other")).toBeUndefined();
  });
});

describe("getAscentEntryId", () => {
  it("returns the explicitly recorded ascent", async () => {
    const entries = await getJournalForClimb(db, OWNER_ID, OWNER_ID, HIGHBALL);
    const ascent = entries.find((e) => e.isAscent);
    expect(await getAscentEntryId(db, OWNER_ID, HIGHBALL)).toBe(ascent?.id);
  });

  it("is undefined for a climb with sessions but no send", async () => {
    expect(await getAscentEntryId(db, OWNER_ID, SLAB)).toBeUndefined();
  });

  it("is scoped to one climber", async () => {
    expect(await getAscentEntryId(db, "tl-other", HIGHBALL)).toBeUndefined();
  });
});

describe("hasJournalEntries", () => {
  it("tells a journal with entries from an empty one", async () => {
    await seedFixtureUser(db, { id: "tl-empty" });

    expect(await hasJournalEntries(db, OWNER_ID, OWNER_ID)).toBe(true);
    expect(await hasJournalEntries(db, "tl-empty", "tl-empty")).toBe(false);
  });
});

describe("getJournalSessionsForAnalytics", () => {
  it("returns only outdoor sessions associated with climbs", async () => {
    const sessions = await getJournalSessionsForAnalytics(db, OWNER_ID, OWNER_ID);

    expect(sessions).toHaveLength(4);
    expect(sessions.reduce((total, session) => total + session.count, 0)).toBe(5);
    expect(sessions.find((session) => session.entryDate === "2025-02-02")?.count).toBe(2);
    expect(sessions.every((session) => session.climbType !== null)).toBe(true);
    expect(sessions.some((session) => session.entryDate === "2026-01-15")).toBe(false);
    expect(sessions.some((session) => session.entryDate === "2025-04-01")).toBe(false);
  });
});

describe("getPinnedProjects", () => {
  it("lists a pinned climb with the sessions it has accumulated", async () => {
    await seedFixturePinnedProject(db, { userId: OWNER_ID, climbId: SLAB });

    const projects = await getPinnedProjects(db, OWNER_ID, OWNER_ID, { sent: false });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      climbId: SLAB,
      climbName: "Test Slab",
      areaName: "Test Slab Area",
      sessionCount: 2,
      noteCount: 0,
      firstSession: "2025-03-05",
      lastSession: "2025-03-06",
      sent: false,
      sentOn: null,
    });
  });

  it("lists a pin that has never been climbed, with no dates to show", async () => {
    const ownerId = "tl-pin-untouched";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: SLAB, pinnedAt: "2025-09-09" });

    const projects = await getPinnedProjects(db, ownerId, ownerId, { sent: false });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      climbId: SLAB,
      sessionCount: 0,
      noteCount: 0,
      firstSession: null,
      lastSession: null,
      pinnedAt: "2025-09-09",
      sent: false,
    });
  });

  it("does not list a climb with sessions that was never pinned", async () => {
    // The whole point of the pin: logging sessions no longer enrolls a climb.
    expect(await getPinnedProjects(db, OWNER_ID, OWNER_ID, { sent: false })).toEqual([]);
  });

  it("moves a pin to the sent side once it is sent, instead of dropping it", async () => {
    await seedFixturePinnedProject(db, { userId: OWNER_ID, climbId: SLAB });
    await seedFixtureSend(db, { userId: OWNER_ID, climbId: SLAB, dateSent: "2025-03-07" });

    expect(await getPinnedProjects(db, OWNER_ID, OWNER_ID, { sent: false })).toEqual([]);
    const sent = await getPinnedProjects(db, OWNER_ID, OWNER_ID, { sent: true });
    expect(sent.map(({ climbId }) => climbId)).toEqual([SLAB]);
    expect(sent[0]).toMatchObject({ sent: true, sentOn: "2025-03-07", sessionCount: 2 });
  });

  it("keeps an undated send on the sent side", async () => {
    const ownerId = "tl-pin-undated";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: SLAB });
    await seedFixtureSend(db, { userId: ownerId, climbId: SLAB, dateSent: null });

    expect(await getPinnedProjects(db, ownerId, ownerId, { sent: false })).toEqual([]);
    const sent = await getPinnedProjects(db, ownerId, ownerId, { sent: true });
    expect(sent.map(({ climbId }) => climbId)).toEqual([SLAB]);
    // An undated send still counts as sent; `sent` is what distinguishes it
    // from a pin that simply has no send.
    expect(sent[0]).toMatchObject({ sent: true, sentOn: null });
  });

  it("ignores another climber's send on the same climb", async () => {
    const ownerId = "tl-pin-other-send";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: SLAB });
    await seedFixtureSend(db, { userId: OWNER_ID, climbId: SLAB, dateSent: "2025-03-07" });

    const open = await getPinnedProjects(db, ownerId, ownerId, { sent: false });
    expect(open.map(({ climbId }) => climbId)).toEqual([SLAB]);
  });

  it("sorts a pin with no sessions after the active ones, by when it was pinned", async () => {
    const ownerId = "tl-pin-order";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: SLAB, entryDate: "2025-05-01" });
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: SLAB, pinnedAt: "2025-04-01" });
    // Pinned most recently, but never climbed: it must not outrank the project
    // with real activity just because its date sorts as NULL.
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: 4, pinnedAt: "2025-12-01" });
    await seedFixturePinnedProject(db, {
      userId: ownerId,
      climbId: CRIMPER,
      pinnedAt: "2025-11-01",
    });

    const projects = await getPinnedProjects(db, ownerId, ownerId, { sent: false });
    expect(projects.map(({ climbId }) => climbId)).toEqual([SLAB, 4, CRIMPER]);
  });

  it("bounds the number of projects returned", async () => {
    const ownerId = "tl-pin-limit";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: SLAB, entryDate: "2025-06-01" });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: 4, entryDate: "2025-06-02" });
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: SLAB });
    await seedFixturePinnedProject(db, { userId: ownerId, climbId: 4 });

    const projects = await getPinnedProjects(db, ownerId, ownerId, { sent: false }, 1);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.climbId).toBe(4);
  });
});

describe("getPinnedProjectSessions", () => {
  const SESSIONS_OWNER = "tl-project-sessions";

  beforeEach(async () => {
    await seedFixtureUser(db, { id: SESSIONS_OWNER });
    await seedFixtureJournalEntry(db, {
      userId: SESSIONS_OWNER,
      climbId: SLAB,
      entryDate: "2025-08-01",
      body: "First look. Heels everywhere.",
    });
    await seedFixtureJournalEntry(db, {
      userId: SESSIONS_OWNER,
      climbId: SLAB,
      entryDate: "2025-08-08",
      body: "Linked the bottom.",
    });
    await seedFixtureJournalEntry(db, {
      userId: SESSIONS_OWNER,
      climbId: SLAB,
      entryDate: "2025-08-15",
      body: "One move from the top.",
    });
    await seedFixtureJournalEntry(db, {
      userId: SESSIONS_OWNER,
      climbId: SLAB,
      entryDate: "2025-08-22",
      body: "Skin gone. Back Tuesday.",
      tags: ["beta", "skin"],
    });
    await seedFixtureJournalEntry(db, {
      userId: SESSIONS_OWNER,
      climbId: CRIMPER,
      entryDate: "2025-08-20",
      body: "Clipping stance is the whole problem.",
    });
  });

  it("returns the newest sessions of every requested project in one read", async () => {
    const sessions = await getPinnedProjectSessions(db, SESSIONS_OWNER, SESSIONS_OWNER, [
      SLAB,
      CRIMPER,
    ]);

    expect(sessions.map((entry) => [entry.climbId, entry.entryDate])).toEqual([
      [SLAB, "2025-08-22"],
      [CRIMPER, "2025-08-20"],
      [SLAB, "2025-08-15"],
      [SLAB, "2025-08-08"],
    ]);
    expect(sessions[0]).toMatchObject({
      body: "Skin gone. Back Tuesday.",
      climbName: "Test Slab",
      areaName: "Test Slab Area",
      climbType: "boulder",
      sent: false,
      tags: ["beta", "skin"],
      companions: [],
    });
  });

  it("ranks per climb, so a busy project cannot crowd out a quiet one", async () => {
    const sessions = await getPinnedProjectSessions(
      db,
      SESSIONS_OWNER,
      SESSIONS_OWNER,
      [SLAB, CRIMPER],
      1,
    );

    expect(sessions.map((entry) => [entry.climbId, entry.entryDate])).toEqual([
      [SLAB, "2025-08-22"],
      [CRIMPER, "2025-08-20"],
    ]);
  });

  it("reads only the climbs it was asked for", async () => {
    const sessions = await getPinnedProjectSessions(db, SESSIONS_OWNER, SESSIONS_OWNER, [CRIMPER]);
    expect(sessions.map((entry) => entry.climbId)).toEqual([CRIMPER]);
    expect(await getPinnedProjectSessions(db, SESSIONS_OWNER, SESSIONS_OWNER, [])).toEqual([]);
  });

  it("keeps the sessions of a sent project, which still has a card to fill", async () => {
    await seedFixtureSend(db, {
      userId: SESSIONS_OWNER,
      climbId: SLAB,
      dateSent: "2025-08-23",
    });

    const sessions = await getPinnedProjectSessions(db, SESSIONS_OWNER, SESSIONS_OWNER, [
      SLAB,
      CRIMPER,
    ]);
    expect(sessions.map((entry) => entry.climbId)).toEqual([SLAB, CRIMPER, SLAB, SLAB]);
  });
});

describe("getOpenProjectSuggestions", () => {
  it("offers climbs worked but never sent, with the session count as the evidence", async () => {
    const suggestions = await getOpenProjectSuggestions(db, OWNER_ID, OWNER_ID);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      climbId: SLAB,
      climbName: "Test Slab",
      sessionCount: 2,
      noteCount: 0,
    });
  });

  it("stops offering a climb once it is pinned", async () => {
    await seedFixturePinnedProject(db, { userId: OWNER_ID, climbId: SLAB });
    expect(await getOpenProjectSuggestions(db, OWNER_ID, OWNER_ID)).toEqual([]);
  });

  it("stops offering a climb once it is sent", async () => {
    await seedFixtureSend(db, { userId: OWNER_ID, climbId: SLAB, dateSent: "2025-03-07" });
    expect(await getOpenProjectSuggestions(db, OWNER_ID, OWNER_ID)).toEqual([]);
  });

  it("counts only the sessions that carry a written note", async () => {
    const ownerId = "tl-project-notes";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixtureJournalEntry(db, {
      userId: ownerId,
      climbId: SLAB,
      entryDate: "2025-07-01",
      body: "Crux feels impossible.",
    });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: SLAB, entryDate: "2025-07-02" });
    await seedFixtureJournalEntry(db, {
      userId: ownerId,
      climbId: SLAB,
      entryDate: "2025-07-03",
      body: "   ",
    });

    const [project] = await getOpenProjectSuggestions(db, ownerId, ownerId);
    expect(project).toMatchObject({ sessionCount: 3, noteCount: 1 });
  });

  it("ranks the most worked climb first", async () => {
    const ownerId = "tl-suggestion-order";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: 4, entryDate: "2025-05-02" });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: SLAB, entryDate: "2025-05-01" });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: SLAB, entryDate: "2025-04-01" });

    const suggestions = await getOpenProjectSuggestions(db, ownerId, ownerId);
    expect(suggestions.map(({ climbId }) => climbId)).toEqual([SLAB, 4]);
  });

  it("bounds how many it offers", async () => {
    const ownerId = "tl-suggestion-limit";
    await seedFixtureUser(db, { id: ownerId });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: SLAB, entryDate: "2025-06-01" });
    await seedFixtureJournalEntry(db, { userId: ownerId, climbId: 4, entryDate: "2025-06-02" });

    expect(await getOpenProjectSuggestions(db, ownerId, ownerId, 1)).toHaveLength(1);
  });
});

describe("the timeline's query plan", () => {
  it("seeks journal_user_date_idx and does not sort", async () => {
    const plans = await explainQueries(db, async () =>
      getJournalPage(db, OWNER_ID, OWNER_ID, filter(), { entryDate: "2026-01-01", id: 1 }),
    );
    expect(plans).toHaveLength(1);
    const [plan] = plans;
    const detail = plan.map((row) => row.detail).join("\n");
    expect(detail).toContain("journal_user_date_idx");
    expect(detail).not.toContain("TEMP B-TREE");
  });
});

describe("journal date ranges", () => {
  it("includes boundary sessions and keeps the range when paging", async () => {
    const dates = { dateFrom: "2025-03-05", dateTo: "2025-04-01" };
    const first = await getJournalPage(db, OWNER_ID, OWNER_ID, filter(dates), null, 2);
    expect(first.entries.map((entry) => entry.entryDate)).toEqual(["2025-04-01", "2025-03-06"]);
    expect(first.hasMore).toBe(true);
    const second = await getJournalPage(db, OWNER_ID, OWNER_ID, filter(dates), first.nextCursor, 2);
    expect(second.entries.map((entry) => entry.entryDate)).toEqual(["2025-03-05"]);
    expect(second.hasMore).toBe(false);
    const sessions = await getJournalPage(
      db,
      OWNER_ID,
      OWNER_ID,
      filter({ ...dates, view: "sessions" }),
    );
    expect(sessions.entries.map((entry) => entry.entryDate)).toEqual(["2025-03-06", "2025-03-05"]);
  });
});

it.each([7, 0, null])(
  "returns the climber's grade %s only on completed journal entries, clearing it after unsending",
  async (suggestedGrade) => {
    await db
      .update(sends)
      .set({ suggestedGrade })
      .where(and(eq(sends.userId, OWNER_ID), eq(sends.climbId, HIGHBALL)));
    const entries = await getJournalForClimb(db, OWNER_ID, OWNER_ID, HIGHBALL, 10);
    expect(entries.filter((entry) => entry.sent)).toMatchObject([
      { reportedGrade: suggestedGrade, climbGrade: 5 },
      { reportedGrade: suggestedGrade, climbGrade: 5 },
    ]);
    expect(entries.filter((entry) => !entry.sent)).toMatchObject([{ reportedGrade: null }]);
    await db.delete(sends).where(and(eq(sends.userId, OWNER_ID), eq(sends.climbId, HIGHBALL)));
    const unsent = await getJournalForClimb(db, OWNER_ID, OWNER_ID, HIGHBALL, 10);
    expect(unsent.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
    expect(unsent).toMatchObject(
      Array.from({ length: 3 }, () => ({
        sent: false,
        isAscent: false,
        reportedGrade: null,
        climbGrade: 5,
      })),
    );
  },
);
