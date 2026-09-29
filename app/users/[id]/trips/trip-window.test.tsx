import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TripAnalyticsPage from "@/app/users/[id]/trips/[tripId]/analytics/page";
import TripPage, {
  generateMetadata as tripPageMetadata,
} from "@/app/users/[id]/trips/[tripId]/page";
import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { userAnalyticsLayouts } from "@/db/schema";
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

/** Each send has a distinct comment so tests can tell which sends were rendered. */
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
  // A user can send a climb only once, so each send uses a different climb.
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

/** Runs the async server component nested in the page (the one with a `filter`
 * prop) so assertions can see the rows it loaded. Client components below it
 * can't run here, but their props already contain the rows. */
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
  // The page tree has the trip, notes and album. The resolved view has the
  // sends. Both are included in the returned string.
  return JSON.stringify(tree) + JSON.stringify(await resolveNestedView(tree));
}

beforeEach(async () => {
  session.userId = OWNER;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner" });
  await seedFixtureUser(db, { id: STRANGER, name: "Passing Climber" });
});

describe("trip sends", () => {
  it("include only sends dated within the trip", async () => {
    const trip = await seedTrip();

    const payload = await renderTrip(trip.id);
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(BEFORE);
    expect(payload).not.toContain(AFTER);
  });

  it("ignore date and filter params in the URL", async () => {
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

  it("exclude undated sends", async () => {
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

  it("render without the filter toolbar", async () => {
    const trip = await seedTrip();

    expect(await renderTrip(trip.id)).toContain('"bare":true');
  });
});

describe("trip page", () => {
  it("renders the album, notes and sends in order, without journal entries", async () => {
    const album = "https://photos.app.goo.gl/Example1Album2Link3";
    const trip = await seedTrip({ notes: NOTES, albumUrl: album });

    const payload = await renderTrip(trip.id);
    const at = (text: string) => payload.indexOf(text);
    expect(at(`"link":"${album}"`)).toBeGreaterThan(-1);
    expect(at(`"link":"${album}"`)).toBeLessThan(at(`"notes":"${NOTES}"`));
    expect(at(`"notes":"${NOTES}"`)).toBeLessThan(at('"bare":true'));
    // Journal entries aren't rendered on the trip page.
    expect(payload).not.toContain(ENTRY);
  });

  it("links to analytics next to the sends heading", async () => {
    const trip = await seedTrip({ notes: NOTES });

    const payload = await renderTrip(trip.id);
    const analytics = payload.indexOf(`"href":"/users/${OWNER}/trips/${trip.id}/analytics"`);
    expect(analytics).toBeGreaterThan(payload.indexOf(`"notes":"${NOTES}"`));
    expect(analytics).toBeLessThan(payload.indexOf('"bare":true'));
  });

  it("renders no album, and an empty notes section only for the owner", async () => {
    const trip = await seedTrip();

    const asOwner = await renderTrip(trip.id);
    expect(asOwner).not.toContain('"link"');
    expect(asOwner).toContain('"notes":null');
    expect(asOwner).toContain('"canEdit":true');

    await seedFriend();
    session.userId = FRIEND;
    expect(await renderTrip(trip.id)).not.toContain('"canEdit"');
  });

  it("shows an empty message for a past trip with no sends and hides the section for an upcoming one", async () => {
    const past = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Rained off",
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    const rainedOff = await renderTrip(past.id);
    expect(rainedOff).toContain("No sends on this trip yet.");
    // No analytics link when nothing is logged.
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

describe("trip page title", () => {
  it("puts the user's name before the trip name", async () => {
    const trip = await seedTrip();
    session.userId = STRANGER;

    const metadata = await tripPageMetadata(props(trip.id));

    expect(metadata.title).toBe("Trip Owner · Bishop");
    expect(metadata.robots).toEqual({ index: false });
  });
});

describe("sharing a trip", () => {
  it("gives the share URL to the owner only", async () => {
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

  it("gives no share URL when the owner's profile is private", async () => {
    const trip = await seedTrip();
    const before = (await getProfileShareToken(db, OWNER))!;
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = ${OWNER}`);
    const after = (await getProfileShareToken(db, OWNER))!;

    const payload = await renderTrip(trip.id);
    expect(payload).toContain('"shareUrl":null');
    expect(payload).not.toContain(before);
    expect(payload).not.toContain(after);
  });

  it("passes no share URL to the analytics page", async () => {
    const trip = await seedTrip();

    expect(JSON.stringify(await TripAnalyticsPage(props(trip.id)))).not.toContain("shareUrl");
  });
});

describe("trip access", () => {
  it("shows a member who isn't a friend the trip and sends but not the notes", async () => {
    const trip = await seedTrip({ notes: NOTES });
    await journalAudience("public");
    session.userId = STRANGER;

    const payload = await renderTrip(trip.id);
    expect(payload).toContain("Bishop");
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(NOTES);
    expect(payload).not.toContain('"canEdit"');
    // The viewer id is the member's, not the owner's.
    expect(payload).toContain(`"viewerId":"${STRANGER}"`);
  });

  it("shows notes to a member only with a valid share link", async () => {
    const trip = await seedTrip({ notes: NOTES });
    const link = (await getProfileShareToken(db, OWNER))!;
    session.userId = STRANGER;

    const payload = await renderTrip(trip.id, { share: link });
    expect(payload).toContain(`"notes":"${NOTES}"`);
    expect(payload).toContain('"canEdit":false');
    // Still rendered with the member as the viewer.
    expect(payload).toContain(`"viewerId":"${STRANGER}"`);

    const own = (await getProfileShareToken(db, STRANGER))!;
    for (const share of ["0".repeat(32), own, "not a link"]) {
      expect(await renderTrip(trip.id, { share })).not.toContain(NOTES);
    }
  });

  it("shows notes to a friend regardless of journal audience, editable only by the owner", async () => {
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

  it("returns not found to everyone but the owner when the profile is private", async () => {
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

  it("links back to the trip and renders no album or notes", async () => {
    const album = "https://photos.app.goo.gl/Example1Album2Link3";
    const trip = await seedTrip({ notes: NOTES, albumUrl: album });

    const payload = JSON.stringify(await TripAnalyticsPage(props(trip.id)));

    expect(payload).toContain('"back":"trip"');
    expect(payload).not.toContain(`"link":"${album}"`);
    expect(payload).not.toContain(NOTES);
  });

  it("shows an empty message when nothing is logged", async () => {
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

  it("uses the trip layout instead of the owner's saved layout", async () => {
    const trip = await seedTrip();
    await db.insert(userAnalyticsLayouts).values({
      userId: OWNER,
      layout: { cards: ["bestYear", "streak"], charts: ["calendar", "progression"] },
    });

    const tree = await TripAnalyticsPage(props(trip.id));
    const dashboard = JSON.parse(JSON.stringify(tree)).props.children.props.children.props;

    expect(dashboard.initialLayout).toEqual({
      cards: ["sends", "hardest", "days", "firstTry"],
      charts: ["pyramid"],
    });
    expect(dashboard.canCustomize).toBe(false);
  });

  it("passes no per-month average", async () => {
    const trip = await seedTrip();

    const tree = await TripAnalyticsPage(props(trip.id));
    const { analytics } = JSON.parse(JSON.stringify(tree)).props.children.props.children.props;

    expect(analytics.daysOut).toBeGreaterThan(0);
    expect(analytics.daysPerMonth).toBeNull();
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
