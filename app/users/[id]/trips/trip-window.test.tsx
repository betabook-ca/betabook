import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TripAnalyticsPage from "@/app/users/[id]/trips/[tripId]/analytics/page";
import TripJournalPage from "@/app/users/[id]/trips/[tripId]/page";
import TripSendsPage from "@/app/users/[id]/trips/[tripId]/sends/page";
import { createDb } from "@/db/client";
import {
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
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const db = createDb(env.DB);
const OWNER = "owner";
const STRANGER = "stranger";
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

describe("who can open a trip", () => {
  it("refuses another climber, without confirming the trip exists", async () => {
    const trip = await seedTrip();
    session.userId = STRANGER;

    await expect(renderJournal(trip.id)).rejects.toThrow("NOT_FOUND");
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
