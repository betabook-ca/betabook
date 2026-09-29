import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TripAnalyticsPage from "@/app/users/[id]/trips/[tripId]/analytics/page";
import TripPage, {
  generateMetadata as tripPageMetadata,
} from "@/app/users/[id]/trips/[tripId]/page";
import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
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
vi.mock("@/lib/app-url", () => ({ getBaseUrl: async () => "https://betabook.test" }));
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

/** The comments are the probe: a send outside the trip's dates must not
 * appear in the rendered tree no matter what the URL asked for. */
const INSIDE = "Sent inside the trip.";
const BEFORE = "Sent long before the trip.";
const AFTER = "Sent long after the trip.";
const ENTRY = "A session inside the trip.";
const NOTES = "Camped at the Pit.";

async function seedTrip(extra: { notes?: string; albumUrl?: string } = {}) {
  const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP, ...extra });
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: CLIMB,
    dateSent: "2026-03-15",
    comment: INSIDE,
  });
  // A climber sends a climb once, so each of these is a climb of its own.
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: 3,
    dateSent: "2020-01-01",
    comment: BEFORE,
  });
  await seedFixtureSend(db, {
    userId: OWNER,
    climbId: 4,
    dateSent: "2030-01-01",
    comment: AFTER,
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-03-16",
    body: ENTRY,
  });
  return trip;
}

async function seedFriend() {
  await seedFixtureUser(db, { id: FRIEND, name: "Climbing Partner" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
}

function journalAudience(audience: "private" | "friends" | "public") {
  return db.run(sql`UPDATE user SET journal_visibility = ${audience} WHERE id = ${OWNER}`);
}

type Element = { type?: unknown; props?: Record<string, unknown> };

/** Resolves the one async server component the page nests inside its header,
 * so the assertions below run against the rows the view actually read rather
 * than against an unrendered element. Stops there: everything under it is a
 * client component whose hooks cannot run here, and its props already carry
 * the rows. */
async function resolveNestedView(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) {
    for (const child of node) {
      const view = await resolveNestedView(child);
      if (view) return view;
    }
    return null;
  }
  const element = node as Element | null;
  if (!element || typeof element !== "object") return null;
  const props = element.props;
  if (props && "filter" in props && typeof element.type === "function") {
    return (element.type as (p: unknown) => Promise<unknown>)(props);
  }
  return props && "children" in props ? resolveNestedView(props.children) : null;
}

const props = (tripId: number | string, search: Record<string, string | string[]> = {}) => ({
  params: Promise.resolve({ id: OWNER, tripId: String(tripId) }),
  searchParams: Promise.resolve(search),
});

async function renderTrip(tripId: number, search: Record<string, string | string[]> = {}) {
  const tree = await TripPage(props(tripId, search));
  // The page tree carries the trip, its notes and its album; the resolved
  // view carries the sends. Both are in the string under assertion.
  return JSON.stringify(tree) + JSON.stringify(await resolveNestedView(tree));
}

beforeEach(async () => {
  session.userId = OWNER;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner" });
  await seedFixtureUser(db, { id: STRANGER, name: "Passing Climber" });
});

describe("the sends a trip lists", () => {
  it("are those dated inside it and nothing on either side", async () => {
    const trip = await seedTrip();

    const payload = await renderTrip(trip.id);
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(BEFORE);
    expect(payload).not.toContain(AFTER);
  });

  it("cannot be widened, narrowed or filtered by the URL, so the trip means one thing", async () => {
    const trip = await seedTrip();

    const asked: Record<string, string>[] = [
      { dateFrom: "1900-01-01", dateTo: "2999-12-31", datePreset: "this-year" },
      { date: "2020-01-01" },
      { dateFrom: "2026-03-18", dateTo: "2026-03-19" },
      { name: "no such climb" },
    ];
    for (const search of asked) {
      const payload = await renderTrip(trip.id, search);
      expect(payload).toContain(INSIDE);
      expect(payload).not.toContain(BEFORE);
      expect(payload).not.toContain(AFTER);
    }
  });

  it("leave out an undated send, which cannot be shown to fall inside", async () => {
    const trip = await seedTrip();
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      dateSent: null,
      comment: "No date on this one.",
    });

    const payload = await renderTrip(trip.id);
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain("No date on this one.");
  });

  it("come with no toolbar: the Sends tab is where a climber filters", async () => {
    const trip = await seedTrip();

    expect(await renderTrip(trip.id)).toContain('"bare":true');
  });
});

describe("what a trip's page holds", () => {
  it("is one page: the album, the notes and the sends, with the journal a link away", async () => {
    const album = "https://photos.app.goo.gl/Example1Album2Link3";
    const trip = await seedTrip({ notes: NOTES, albumUrl: album });

    const payload = await renderTrip(trip.id);
    const at = (text: string) => payload.indexOf(text);
    expect(at(`"link":"${album}"`)).toBeGreaterThan(-1);
    expect(at(`"link":"${album}"`)).toBeLessThan(at(`"notes":"${NOTES}"`));
    expect(at(`"notes":"${NOTES}"`)).toBeLessThan(at('"bare":true'));
    // The entries are in the Journal, under the trip's dates.
    expect(payload).not.toContain(ENTRY);
  });

  it("links the trip's analytics beside its sends", async () => {
    const trip = await seedTrip({ notes: NOTES });

    const payload = await renderTrip(trip.id);
    const analytics = payload.indexOf(`"href":"/users/${OWNER}/trips/${trip.id}/analytics"`);
    expect(analytics).toBeGreaterThan(payload.indexOf(`"notes":"${NOTES}"`));
    expect(analytics).toBeLessThan(payload.indexOf('"bare":true'));
  });

  it("has no album and no notes to show a trip that has neither, but its owner can write some", async () => {
    const trip = await seedTrip();

    const asOwner = await renderTrip(trip.id);
    expect(asOwner).not.toContain('"link"');
    expect(asOwner).toContain('"notes":null');
    expect(asOwner).toContain('"canEdit":true');

    await seedFriend();
    session.userId = FRIEND;
    expect(await renderTrip(trip.id)).not.toContain('"canEdit"');
  });

  it("says a trip with nothing sent has nothing sent, and lists nothing for one still to come", async () => {
    const past = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Rained off",
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    const rainedOff = await renderTrip(past.id);
    expect(rainedOff).toContain("No sends on this trip yet.");
    // Nothing logged, so nothing to chart.
    expect(rainedOff).not.toContain("/analytics");

    const upcoming = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Squamish",
      startDate: "2999-05-14",
      endDate: "2999-05-21",
    });
    const payload = await renderTrip(upcoming.id);
    expect(payload).not.toContain("No sends on this trip yet.");
    expect(payload).not.toContain('"bare"');
  });
});

describe("what a trip's tab is called", () => {
  it("names the climber before the trip, as their other pages do", async () => {
    const trip = await seedTrip();
    session.userId = STRANGER;

    const metadata = await tripPageMetadata(props(trip.id));

    expect(metadata.title).toBe("Trip Owner · Bishop");
    expect(metadata.robots).toEqual({ index: false });
  });
});

describe("sharing a trip", () => {
  it("gives the owner their profile link opened on the trip, and gives it to nobody else", async () => {
    const trip = await seedTrip({ notes: NOTES });
    await seedFriend();
    const token = (await getProfileShareToken(db, OWNER))!;

    expect(await renderTrip(trip.id)).toContain(
      `"shareUrl":"https://betabook.test/users/${OWNER}/trips/${trip.id}?share=${token}"`,
    );

    for (const reader of [FRIEND, STRANGER]) {
      session.userId = reader;
      const payload = await renderTrip(trip.id);
      expect(payload).toContain(INSIDE);
      expect(payload).not.toContain(token);
      expect(payload).not.toContain("shareUrl");
    }
  });

  it("has no link to give while the owner's profile is private", async () => {
    const trip = await seedTrip();
    const before = (await getProfileShareToken(db, OWNER))!;
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    const after = (await getProfileShareToken(db, OWNER))!;

    const payload = await renderTrip(trip.id);
    expect(payload).toContain('"shareUrl":null');
    expect(payload).not.toContain(before);
    expect(payload).not.toContain(after);
  });

  it("offers no link over the trip's analytics", async () => {
    const trip = await seedTrip();

    expect(JSON.stringify(await TripAnalyticsPage(props(trip.id)))).not.toContain("shareUrl");
  });
});

describe("who can open a trip", () => {
  it("shows a member the trip and its sends, and nothing of the notes", async () => {
    const trip = await seedTrip({ notes: NOTES });
    await journalAudience("public");
    session.userId = STRANGER;

    const payload = await renderTrip(trip.id);
    expect(payload).toContain("Bishop");
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(NOTES);
    expect(payload).not.toContain('"canEdit"');
    // Read as the member, not as the owner the route names.
    expect(payload).toContain(`"viewerId":"${STRANGER}"`);
  });

  it("shows a member who holds the climber's profile link the notes, and no other link does", async () => {
    const trip = await seedTrip({ notes: NOTES });
    const link = (await getProfileShareToken(db, OWNER))!;
    session.userId = STRANGER;

    const payload = await renderTrip(trip.id, { share: link });
    expect(payload).toContain(`"notes":"${NOTES}"`);
    expect(payload).toContain('"canEdit":false');
    // Still read as the member they are.
    expect(payload).toContain(`"viewerId":"${STRANGER}"`);

    const own = (await getProfileShareToken(db, STRANGER))!;
    for (const share of ["0".repeat(32), own, "not a link"]) {
      expect(await renderTrip(trip.id, { share })).not.toContain(NOTES);
    }
  });

  it("shows a friend the notes, whatever the journal's audience, and only the owner may edit them", async () => {
    const trip = await seedTrip({ notes: NOTES });
    await seedFriend();
    await journalAudience("private");

    expect(await renderTrip(trip.id)).toContain('"canEdit":true');

    session.userId = FRIEND;
    const payload = await renderTrip(trip.id);
    expect(payload).toContain(`"notes":"${NOTES}"`);
    expect(payload).toContain(`"children":"${NOTES}"`);
    expect(payload).toContain('"canEdit":false');
    expect(payload).toContain(INSIDE);
  });

  it("refuses everyone else once the profile is private", async () => {
    const trip = await seedTrip();
    await seedFriend();
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);

    for (const viewer of [STRANGER, FRIEND]) {
      session.userId = viewer;
      await expect(renderTrip(trip.id)).rejects.toThrow("NOT_FOUND");
    }
    session.userId = OWNER;
    expect(await renderTrip(trip.id)).toContain(INSIDE);
  });

  it("refuses a trip id that is not this climber's", async () => {
    const theirs = await seedFixtureTrip(db, { userId: STRANGER, name: "Squamish", ...BISHOP });

    await expect(renderTrip(theirs.id)).rejects.toThrow("NOT_FOUND");
  });

  it("refuses an id that was never a trip", async () => {
    await expect(renderTrip(9999)).rejects.toThrow("NOT_FOUND");
  });

  it("refuses a route parameter that is not an id at all", async () => {
    await seedTrip();

    for (const raw of ["abc", "-1", "0", "1.5", ""]) {
      await expect(TripPage(props(raw))).rejects.toThrow("NOT_FOUND");
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
    expect(await renderTrip(trip.id)).toContain(INSIDE);

    for (const raw of aliases) {
      await expect(TripPage(props(raw))).rejects.toThrow("NOT_FOUND");
    }
  });

  it("shows a signed-out reader the sign-in callout rather than a 404", async () => {
    const trip = await seedTrip({ notes: NOTES });
    session.userId = null;

    const payload = await renderTrip(trip.id);
    // Nothing about the climber or the trip is in the tree either way.
    expect(payload).not.toContain(INSIDE);
    expect(payload).not.toContain(NOTES);
    expect(payload).not.toContain("Bishop");
  });
});

describe("the trip's analytics", () => {
  it("never announces an eleven-day window as all-time", async () => {
    const trip = await seedTrip();

    const payload = JSON.stringify(await TripAnalyticsPage(props(trip.id)));

    expect(payload).toContain("Activity on this trip");
    expect(payload).not.toContain("All-time activity");
  });

  it("leads back to the trip it is about, and carries none of its album or notes", async () => {
    const album = "https://photos.app.goo.gl/Example1Album2Link3";
    const trip = await seedTrip({ notes: NOTES, albumUrl: album });

    const payload = JSON.stringify(await TripAnalyticsPage(props(trip.id)));

    expect(payload).toContain('"back":"trip"');
    expect(payload).not.toContain(`"link":"${album}"`);
    expect(payload).not.toContain(NOTES);
  });

  it("says a trip with nothing logged has nothing logged", async () => {
    const upcoming = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Squamish",
      startDate: "2027-05-14",
      endDate: "2027-05-21",
    });

    expect(JSON.stringify(await TripAnalyticsPage(props(upcoming.id)))).toContain(
      "Nothing logged on this trip yet.",
    );
  });

  it("leaves a climber's hardest-ever send out of a trip that predates it", async () => {
    const trip = await seedFixtureTrip(db, { userId: OWNER, name: "Bishop", ...BISHOP });
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

    const tree = await TripAnalyticsPage(props(trip.id));
    const hardest = JSON.parse(JSON.stringify(tree)).props.children.props.children.props.analytics
      .hardest as { grade: number }[];

    expect(hardest.map((entry) => entry.grade)).toEqual([2]);
  });
});
