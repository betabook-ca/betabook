import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import UserSendsPageImpl from "@/app/users/[id]/sends/page";
import TripAnalyticsPageImpl from "@/app/users/[id]/trips/[tripId]/analytics/page";
import TripPageImpl, {
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
import { rendered } from "@/test/server-tree";

const TripAnalyticsPage = rendered(TripAnalyticsPageImpl);
const TripPage = rendered(TripPageImpl);
// ProfileHeader is synchronous, so it has to be expanded for its tabs to render.
const UserSendsPage = rendered(UserSendsPageImpl, { expand: [ProfileHeader] });
const TripPageWithTabs = rendered(TripPageImpl, { expand: [ProfileHeader] });

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({
  getMemberSession: async () =>
    session.userId ? { user: { id: session.userId, name: "Viewer" } } : null,
  getViewerGradePreferences: async () => ({ boulder: "hueco", rope: "yds" }),
}));
vi.mock("@/lib/request-timezone", () => ({ getRequestTimezone: async () => "UTC" }));
// Album pages come from Google; tests never fetch them.
vi.mock("@/lib/trip-album-loader", () => ({ loadAlbumPhotos: async () => [] }));
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

const props = (tripId: number | string, search: Record<string, string | string[]> = {}) => ({
  params: Promise.resolve({ id: OWNER, tripId: String(tripId) }),
  searchParams: Promise.resolve(search),
});

/** The first element prop named `key` whose props satisfy `match`, found by
 * walking the resolved tree. Function props don't survive JSON, so tests that
 * need one read it here. */
function findProp(
  node: unknown,
  key: string,
  match: (props: Record<string, unknown>) => boolean,
): unknown {
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) stack.push(...current);
    else if (current && typeof current === "object") {
      const props = (current as { props?: Record<string, unknown> }).props;
      if (props && key in props && match(props)) return props[key];
      stack.push(...Object.values(props ?? current));
    }
  }
  throw new Error(`No ${key} prop found`);
}

async function renderTrip(tripId: number, search: Record<string, string | string[]> = {}) {
  return JSON.stringify(await TripPage(props(tripId, search)));
}

beforeEach(async () => {
  session.userId = OWNER;
  await resetDb(db);
  await seedFixtureTree(db);
  // Most tests here are about what members and link holders see inside a
  // trip, so the owner shares trips with Members. The default is Friends.
  await seedFixtureUser(db, { id: OWNER, name: "Trip Owner", tripVisibility: "public" });
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

    // The toolbar is the only part of the sends view that takes `basePath`.
    expect(await renderTrip(trip.id)).not.toContain('"basePath"');
  });
});

describe("trip page", () => {
  it("renders the album, notes and then each day's sends and entries, oldest day first", async () => {
    const album = "https://photos.app.goo.gl/Example1Album2Link3";
    const trip = await seedTrip({ notes: NOTES, albumUrl: album });

    const payload = await renderTrip(trip.id);
    const at = (text: string) => payload.indexOf(text);
    expect(at(`"link":"${album}"`)).toBeGreaterThan(-1);
    expect(at(`"link":"${album}"`)).toBeLessThan(at(`"notes":"${NOTES}"`));
    expect(at(`"notes":"${NOTES}"`)).toBeLessThan(at(INSIDE));
    // The send on Mar 15 (day 6) comes before the session on Mar 16 (day 7).
    expect(at('"date":"2026-03-15","dayNumber":6')).toBeGreaterThan(-1);
    expect(at(INSIDE)).toBeLessThan(at('"date":"2026-03-16","dayNumber":7'));
    expect(at('"date":"2026-03-16","dayNumber":7')).toBeLessThan(at(ENTRY));
  });

  it("sends the days oldest first whatever ?order says, and never widens the range", async () => {
    const trip = await seedTrip();

    // The order provider reads ?order in the browser and reverses the days
    // there, so the server's payload is the same either way.
    const payload = await renderTrip(trip.id, { order: "newest" });
    const at = (text: string) => payload.indexOf(text);
    expect(at('"date":"2026-03-15"')).toBeLessThan(at('"date":"2026-03-16"'));
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(BEFORE);
    expect(payload).not.toContain(AFTER);
  });

  it("shows the send in place of its ascent entry, and keeps other entries for the climb", async () => {
    const trip = await seedTrip();
    const attempt = "Fell off the top twice before it went.";
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: CLIMB,
      entryDate: "2026-03-15",
      body: attempt,
    });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: CLIMB,
      entryDate: "2026-03-15",
      sent: true,
      isAscent: true,
      // An ascent entry mirrors its send's comment.
      body: INSIDE,
    });

    const payload = await renderTrip(trip.id);
    expect(payload).toContain(INSIDE);
    // The ascent entry itself isn't rendered; the send row stands in for it.
    expect(payload).not.toContain('"isAscent":true');
    // A failed session the same day isn't a duplicate, so it stays, before
    // the send it led to.
    expect(payload).toContain(attempt);
    expect(payload.indexOf(attempt)).toBeLessThan(payload.indexOf(INSIDE));
    // The same climb's session the next day still shows.
    expect(payload).toContain(ENTRY);
  });

  it("shows journal entries only to readers of the journal", async () => {
    const trip = await seedTrip();
    await seedFriend();

    // The default journal audience is friends.
    session.userId = FRIEND;
    expect(await renderTrip(trip.id)).toContain(ENTRY);

    session.userId = STRANGER;
    const stranger = await renderTrip(trip.id);
    expect(stranger).toContain(INSIDE);
    expect(stranger).not.toContain(ENTRY);
    expect(stranger).not.toContain('"date":"2026-03-16"');

    await journalAudience("private");
    session.userId = FRIEND;
    const friend = await renderTrip(trip.id);
    expect(friend).toContain(INSIDE);
    expect(friend).not.toContain(ENTRY);
  });

  it("leaves the analytics link to the header counts", async () => {
    const trip = await seedTrip({ notes: NOTES });

    // The header renders the link from the trip (trip-header.dom.test.tsx).
    expect(await renderTrip(trip.id)).not.toContain("/analytics");
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

  it("shows an empty message for a past trip with nothing logged and hides the section for an upcoming one", async () => {
    const past = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Rained off",
      startDate: "2026-02-01",
      endDate: "2026-02-03",
    });
    expect(await renderTrip(past.id)).toContain("Nothing logged on this trip yet.");
    // A reader who can't see the journal is told only about sends.
    session.userId = STRANGER;
    expect(await renderTrip(past.id)).toContain("No sends on this trip yet.");
    session.userId = OWNER;

    const upcoming = await seedFixtureTrip(db, {
      userId: OWNER,
      name: "Squamish",
      startDate: "2999-05-14",
      endDate: "2999-05-21",
    });
    const payload = await renderTrip(upcoming.id);
    expect(payload).toContain('"name":"Squamish"');
    expect(payload).not.toContain("Nothing logged on this trip yet.");
    expect(payload).not.toContain('"aria-label":"Days"');
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
  it("gives the trip's own link to the owner only", async () => {
    const trip = await seedTrip({ notes: NOTES });
    await seedFriend();

    expect(await renderTrip(trip.id)).toContain(
      '"ownerShare":{"share":null,"origin":"https://betabook.test"}',
    );
    const [{ token }] = await db.all<{ token: string }>(sql`
      INSERT INTO trip_share_links (user_id, trip_id) VALUES (${OWNER}, ${trip.id}) RETURNING token
    `);
    expect(await renderTrip(trip.id)).toContain(`"share":{"token":"${token}","expiresAt":null}`);
    // The profile link is not the trip's link.
    expect(await renderTrip(trip.id)).not.toContain((await getProfileShareToken(db, OWNER))!);

    for (const reader of [FRIEND, STRANGER]) {
      session.userId = reader;
      const payload = await renderTrip(trip.id);
      expect(payload).toContain(INSIDE);
      expect(payload).not.toContain(token);
      expect(payload).not.toContain("ownerShare");
    }
  });

  it("passes no link to the analytics page", async () => {
    const trip = await seedTrip();

    expect(JSON.stringify(await TripAnalyticsPage(props(trip.id)))).not.toContain("ownerShare");
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

  it("opens neither notes nor a closed trip for a member holding the profile link", async () => {
    const trip = await seedTrip({ notes: NOTES });
    const link = (await getProfileShareToken(db, OWNER))!;
    session.userId = STRANGER;

    // Open to members, the trip shows, and the profile link adds no notes.
    await db.run(sql`UPDATE user SET trip_visibility = 'public' WHERE id = ${OWNER}`);
    const payload = await renderTrip(trip.id, { share: link });
    expect(payload).toContain(INSIDE);
    expect(payload).not.toContain(NOTES);
    expect(payload).not.toContain(link);

    await db.run(sql`UPDATE user SET trip_visibility = 'private' WHERE id = ${OWNER}`);
    await expect(renderTrip(trip.id, { share: link })).rejects.toThrow("NOT_FOUND");
  });

  it("gives a member outside the audience no Trips tab, with or without the profile link", async () => {
    const trip = await seedTrip();
    await db.run(sql`UPDATE user SET trip_visibility = 'private' WHERE id = ${OWNER}`);
    const link = (await getProfileShareToken(db, OWNER))!;
    session.userId = STRANGER;

    for (const search of [{}, { share: link }]) {
      const page = await UserSendsPage({
        params: Promise.resolve({ id: OWNER }),
        searchParams: Promise.resolve(search),
      });
      expect(findProp(page, "showTrips", () => true)).toBe(false);
      expect(JSON.stringify(page)).not.toContain(link);
    }
    // Inside the audience, the tab shows.
    await db.run(sql`UPDATE user SET trip_visibility = 'public' WHERE id = ${OWNER}`);
    expect(findProp(await TripPageWithTabs(props(trip.id)), "showTrips", () => true)).toBe(true);
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

  it("builds the discipline links from the trip's own path", async () => {
    const trip = await seedTrip();

    const tree = await TripAnalyticsPage(props(trip.id, { share: "0".repeat(32) }));
    const href = findProp(tree, "href", (node) => "present" in node) as (type: string) => string;

    expect(href("boulder")).toBe(`/users/${OWNER}/trips/${trip.id}/analytics?discipline=boulder`);
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
