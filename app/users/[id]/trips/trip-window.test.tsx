import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TripAnalyticsPage from "@/app/users/[id]/trips/[tripId]/analytics/page";
import TripNotesPage from "@/app/users/[id]/trips/[tripId]/notes/page";
import TripJournalPage, {
  generateMetadata as tripPageMetadata,
} from "@/app/users/[id]/trips/[tripId]/page";
import TripSendsPage from "@/app/users/[id]/trips/[tripId]/sends/page";
import { createDb } from "@/db/client";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureTrip,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({
  getMemberSession: async () =>
    session.userId ? { user: { id: session.userId, name: "Viewer" } } : null,
}));
vi.mock("@/lib/request-timezone", () => ({ getRequestTimezone: async () => "UTC" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const db = createDb(env.DB);
const OWNER = "owner";
const STRANGER = "stranger";
const FRIEND = "friend";
const CLIMB = 1;
const OTHER_CLIMB = 2;

const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

/** The entry bodies are the probe: an entry outside the window must not appear
 * in the rendered tree no matter what the URL asked for. */
const INSIDE = "Inside the trip.";
const BEFORE = "Long before the trip.";
const AFTER = "Long after the trip.";

async function seedTrip() {
  const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-03-15",
    body: INSIDE,
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2020-01-01",
    body: BEFORE,
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2030-01-01",
    body: AFTER,
  });
  return trip;
}

type Element = { type?: unknown; props?: Record<string, unknown> };

/** Resolves the one async server component the page nests inside its header,
 * so the assertions below run against the rows the view actually read rather
 * than against an unrendered element. Stops there: everything under it is a
 * client component whose hooks cannot run here, and its props already carry
 * the entries. */
async function resolveNestedView(node: unknown): Promise<unknown> {
  const element = node as Element | null;
  if (!element || typeof element !== "object") return null;
  const props = element.props;
  if (props && "filter" in props && typeof element.type === "function") {
    return (element.type as (p: unknown) => Promise<unknown>)(props);
  }
  return props && "children" in props ? resolveNestedView(props.children) : null;
}

async function renderJournal(tripId: number, search: Record<string, string | string[]> = {}) {
  const tree = await TripJournalPage({
    params: Promise.resolve({ id: OWNER, tripId: String(tripId) }),
    searchParams: Promise.resolve(search),
  });
  const view = await resolveNestedView(tree);
  // The page tree carries the trip and the filter; the resolved view carries
  // the entries. Both matter, so both are in the string under assertion.
  return JSON.stringify(tree) + JSON.stringify(view);
}

beforeEach(async () => {
  session.userId = OWNER;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner" });
  await seedFixtureUser(db, { id: STRANGER, name: "Passing Climber" });
});

describe("the window the page actually reads", () => {
  it("lists what falls inside the trip and nothing on either side", async () => {
    const trip = await seedTrip();

    const payload = await renderJournal(trip.id);
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(BEFORE);
    expect(payload).not.toContain(AFTER);
  });

  it("cannot be widened by date parameters in the URL", async () => {
    const trip = await seedTrip();

    // Every shape the date filter accepts, all of them asking for more than
    // the trip covers. The trip's own dates have to win each time.
    const payload = await renderJournal(trip.id, {
      dateFrom: "1900-01-01",
      dateTo: "2999-12-31",
      datePreset: "this-year",
      date: "2020-01-01",
    });

    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(BEFORE);
    expect(payload).not.toContain(AFTER);
  });

  it("cannot be narrowed by date parameters either, so the trip means one thing", async () => {
    const trip = await seedTrip();

    const payload = await renderJournal(trip.id, { dateFrom: "2026-03-18", dateTo: "2026-03-19" });
    expect(payload).toContain(INSIDE);
  });

  it("lists the sends inside the window and leaves undated ones out", async () => {
    const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: CLIMB,
      dateSent: "2026-03-15",
      comment: "Sent it on the trip.",
    });
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      dateSent: null,
      comment: "No date on this one.",
    });

    const tree = await TripSendsPage({
      params: Promise.resolve({ id: OWNER, tripId: String(trip.id) }),
      searchParams: Promise.resolve({}),
    });
    const payload = JSON.stringify(tree) + JSON.stringify(await resolveNestedView(tree));

    // The dated one proves the list rendered at all, so the absence of the
    // undated one below is a real exclusion rather than an empty page.
    expect(payload).toContain("Sent it on the trip.");
    expect(payload).not.toContain("No date on this one.");
  });
});

describe("what a trip's tab is called", () => {
  it("names the climber before the trip, as their other pages do", async () => {
    const trip = await seedTrip();
    session.userId = STRANGER;

    const metadata = await tripPageMetadata({
      params: Promise.resolve({ id: OWNER, tripId: String(trip.id) }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe("Trip Owner · Bishop");
    expect(metadata.robots).toEqual({ index: false });
  });
});

describe("a trip with nothing dated inside it", () => {
  const EMPTY = { startDate: "2027-05-14", endDate: "2027-05-21" };

  async function renderPage(
    page: typeof TripJournalPage,
    tripId: number,
    search: Record<string, string> = {},
  ) {
    const tree = await page({
      params: Promise.resolve({ id: OWNER, tripId: String(tripId) }),
      searchParams: Promise.resolve(search),
    });
    return JSON.stringify(tree) + JSON.stringify(await resolveNestedView(tree));
  }

  it("says so on every tab instead of blaming filters nobody set", async () => {
    await seedTrip();
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-15" });
    const upcoming = await seedFixtureTrip(db, { userId: OWNER, name: "Squamish", ...EMPTY });

    const journal = await renderPage(TripJournalPage, upcoming.id);
    expect(journal).toContain("No entries on this trip yet.");

    const sends = await renderPage(TripSendsPage, upcoming.id);
    expect(sends).toContain("No sends on this trip yet.");

    const analytics = await renderPage(TripAnalyticsPage, upcoming.id);
    expect(analytics).toContain("Nothing logged on this trip yet.");
    expect(analytics).not.toContain("Nothing logged between");
  });

  it("keeps the filters' own words for a reader who filtered inside a trip", async () => {
    const trip = await seedTrip();
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-15" });

    const journal = await renderPage(TripJournalPage, trip.id, { q: "no such words" });
    expect(journal).not.toContain(INSIDE);
    expect(journal).not.toContain("on this trip yet");

    const sends = await renderPage(TripSendsPage, trip.id, { name: "no such climb" });
    expect(sends).not.toContain("on this trip yet");
  });
});

describe("who can open a trip", () => {
  const SENT = "Sent it on the trip.";

  async function seedTripWithSend() {
    const trip = await seedTrip();
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      dateSent: "2026-03-16",
      comment: SENT,
    });
    await seedFixtureUser(db, { id: FRIEND, name: "Climbing Partner" });
    await seedFixtureFriendship(db, OWNER, FRIEND);
    return trip;
  }

  it("shows a member the trip and its sends, and keeps the journal to its audience", async () => {
    const trip = await seedTripWithSend();
    session.userId = STRANGER;

    const payload = await renderJournal(trip.id);
    expect(payload).toContain("Bishop");
    expect(payload).toContain(SENT);
    expect(payload).not.toContain(INSIDE);
    // Read as the member, not as the owner the route names.
    expect(payload).toContain(`"viewerId":"${STRANGER}"`);
  });

  it("shows a friend the journal entries inside the trip and nothing outside it", async () => {
    const trip = await seedTripWithSend();
    session.userId = FRIEND;

    const payload = await renderJournal(trip.id);
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(BEFORE);
    expect(payload).not.toContain(AFTER);
    expect(payload).toContain(`"viewerId":"${FRIEND}"`);
  });

  it("refuses everyone else once the profile is private", async () => {
    const trip = await seedTripWithSend();
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);

    for (const viewer of [STRANGER, FRIEND]) {
      session.userId = viewer;
      await expect(renderJournal(trip.id)).rejects.toThrow("NOT_FOUND");
    }
    session.userId = OWNER;
    expect(await renderJournal(trip.id)).toContain(INSIDE);
  });

  it("refuses a trip id that is not this climber's", async () => {
    const theirs = await seedFixtureTrip(db, { userId: STRANGER, name: "Squamish", ...BISHOP });

    await expect(renderJournal(theirs.id)).rejects.toThrow("NOT_FOUND");
  });

  it("refuses an id that was never a trip", async () => {
    await expect(renderJournal(9999)).rejects.toThrow("NOT_FOUND");
  });

  it("refuses a route parameter that is not an id at all", async () => {
    await seedTrip();

    for (const raw of ["abc", "-1", "0", "1.5", ""]) {
      await expect(
        TripJournalPage({
          params: Promise.resolve({ id: OWNER, tripId: raw }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow("NOT_FOUND");
    }
  });

  it("refuses every non-canonical spelling of a trip that does exist", async () => {
    const trip = await seedTrip();

    // Aliases of a *live* id, so a refusal proves the parser rejected the
    // shape rather than the database missing the row. `Number` accepts all of
    // these; without the shape check each would render the same trip at a
    // different URL.
    const aliases = [
      `${trip.id}e0`,
      `0x${trip.id.toString(16)}`,
      `${trip.id}.0`,
      `0${trip.id}`,
      ` ${trip.id} `,
      `+${trip.id}`,
    ];
    // The canonical spelling still resolves, so the loop below is not simply
    // refusing everything.
    expect(await renderJournal(trip.id)).toContain(INSIDE);

    for (const raw of aliases) {
      await expect(
        TripJournalPage({
          params: Promise.resolve({ id: OWNER, tripId: raw }),
          searchParams: Promise.resolve({}),
        }),
      ).rejects.toThrow("NOT_FOUND");
    }
  });

  it("shows a signed-out reader the sign-in callout rather than a 404", async () => {
    const trip = await seedTrip();
    session.userId = null;

    const payload = await renderJournal(trip.id);
    // Nothing about the climber or the trip is in the tree either way.
    expect(payload).not.toContain(INSIDE);
    expect(payload).not.toContain("Bishop");
  });
});

describe("the trip's notes", () => {
  const NOTES = "Camped at the Pit.";

  async function renderNotes(tripId: number) {
    const tree = await TripNotesPage({
      params: Promise.resolve({ id: OWNER, tripId: String(tripId) }),
      searchParams: Promise.resolve({}),
    });
    return JSON.stringify(tree);
  }

  it("hands the owner their notes, as source for the editor and as the page to read", async () => {
    const trip = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      notes: NOTES,
      ...BISHOP,
    });

    const payload = await renderNotes(trip.id);
    expect(payload).toContain(`"notes":"${NOTES}"`);
    expect(payload).toContain(`"children":"${NOTES}"`);
  });

  function journalAudience(audience: "private" | "friends" | "public") {
    return db.run(sql`UPDATE user SET journal_visibility = ${audience} WHERE id = ${OWNER}`);
  }

  it("lets a friend read the notes with the journal kept private, and only the owner edit them", async () => {
    const trip = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      notes: NOTES,
      ...BISHOP,
    });
    await seedFixtureUser(db, { id: FRIEND, name: "Climbing Partner" });
    await seedFixtureFriendship(db, OWNER, FRIEND);
    await journalAudience("private");

    expect(await renderNotes(trip.id)).toContain('"canEdit":true');

    session.userId = FRIEND;
    const payload = await renderNotes(trip.id);
    expect(payload).toContain(`"children":"${NOTES}"`);
    expect(payload).toContain('"canEdit":false');
    // The journal's own tab stays with the journal's audience.
    expect(payload).toContain('"journalVisible":false');
    expect(payload).toContain('"notesVisible":true');
  });

  it("offers a friend the notes from the trip's other tabs too", async () => {
    const trip = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      notes: NOTES,
      ...BISHOP,
    });
    await seedFixtureUser(db, { id: FRIEND, name: "Climbing Partner" });
    await seedFixtureFriendship(db, OWNER, FRIEND);
    await journalAudience("private");
    session.userId = FRIEND;

    for (const page of [TripJournalPage, TripSendsPage, TripAnalyticsPage]) {
      const tree = await page({
        params: Promise.resolve({ id: OWNER, tripId: String(trip.id) }),
        searchParams: Promise.resolve({}),
      });
      expect(JSON.stringify(tree)).toContain('"notesVisible":true');
    }
  });

  it("refuses a member who is not a friend, even one the journal is shared with", async () => {
    const trip = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Bishop",
      notes: NOTES,
      ...BISHOP,
    });
    await journalAudience("public");

    session.userId = STRANGER;
    await expect(renderNotes(trip.id)).rejects.toThrow("NOT_FOUND");
    const journal = await renderJournal(trip.id);
    expect(journal).toContain('"journalVisible":true');
    expect(journal).toContain('"notesVisible":false');
    expect(journal).not.toContain(NOTES);

    session.userId = null;
    expect(await renderNotes(trip.id)).not.toContain(NOTES);
  });
});

describe("the trip's analytics", () => {
  it("never announces an eleven-day window as all-time", async () => {
    const trip = await seedTrip();
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-15" });

    const tree = await TripAnalyticsPage({
      params: Promise.resolve({ id: OWNER, tripId: String(trip.id) }),
      searchParams: Promise.resolve({}),
    });
    const payload = JSON.stringify(tree);

    expect(payload).toContain("Activity on this trip");
    expect(payload).not.toContain("All-time activity");
  });

  it("leaves a climber's hardest-ever send out of a trip that predates it", async () => {
    const trip = await seedTrip();
    // Far harder, and far outside the window.
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: CLIMB,
      dateSent: "2020-01-01",
      suggestedGrade: 12,
    });
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      dateSent: "2026-03-15",
      suggestedGrade: 2,
    });

    const tree = await TripAnalyticsPage({
      params: Promise.resolve({ id: OWNER, tripId: String(trip.id) }),
      searchParams: Promise.resolve({}),
    });
    const hardest = JSON.parse(JSON.stringify(tree)).props.children.props.children.props.analytics
      .hardest as { grade: number }[];

    expect(hardest.map((entry) => entry.grade)).toEqual([2]);
  });
});
