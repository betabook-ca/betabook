import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import AreaPage, { generateMetadata as areaMetadata } from "@/app/areas/[id]/[[...slug]]/page";
import { PublicAreaPage } from "@/app/areas/[id]/[[...slug]]/public-area-page";
import ClimbPage, { generateMetadata as climbMetadata } from "@/app/climbs/[id]/[[...slug]]/page";
import { PublicClimbPage } from "@/app/climbs/[id]/[[...slug]]/public-climb-page";
import UserAnalyticsPageImpl from "@/app/users/[id]/analytics/page";
import UserJournalPageImpl from "@/app/users/[id]/journal/page";
import UserPageImpl, { generateMetadata as userMetadata } from "@/app/users/[id]/page";
import UserSendsPageImpl from "@/app/users/[id]/sends/page";
import TripAnalyticsPageImpl from "@/app/users/[id]/trips/[tripId]/analytics/page";
import TripPageImpl, {
  generateMetadata as tripMetadata,
} from "@/app/users/[id]/trips/[tripId]/page";
import UserTripsPageImpl, { generateMetadata as tripsMetadata } from "@/app/users/[id]/trips/page";
import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { getPublicArea, getPublicClimb } from "@/db/queries/public-catalog";
import { climbs, tripCompanions, user } from "@/db/schema";
import { friendshipPair } from "@/lib/friendships";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureTrip,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";
import { rendered, resolveServerTree } from "@/test/server-tree";

const UserAnalyticsPage = rendered(UserAnalyticsPageImpl);
const UserJournalPage = rendered(UserJournalPageImpl);
const UserPage = rendered(UserPageImpl);
const UserSendsPage = rendered(UserSendsPageImpl);
const TripAnalyticsPage = rendered(TripAnalyticsPageImpl);
const TripPage = rendered(TripPageImpl);
const UserTripsPage = rendered(UserTripsPageImpl);

vi.mock("@/lib/session", () => ({ getMemberSession: async () => null }));
vi.mock("@/lib/request-timezone", () => ({ getRequestTimezone: async () => "UTC" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/users/hidden",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await db.update(climbs).set({ description: "Public route description sentinel" });
  await seedFixtureUser(db, { id: "hidden", name: "Restricted identity sentinel" });
});
const areaProps = {
  params: Promise.resolve({ id: "1", slug: ["test-crag"] }),
  searchParams: Promise.resolve({}),
};
const climbProps = {
  params: Promise.resolve({ id: "1", slug: ["test-highball"] }),
  searchParams: Promise.resolve({}),
};
/** Runs `SharedProfileHeader`, which is async because it loads the user's
 * hardest sends, so tests can inspect what it renders. */
async function framed(page: unknown) {
  const element = page as { type: unknown; props: unknown };
  return typeof element.type === "function" && element.type.name === "SharedProfileHeader"
    ? ((await resolveServerTree(
        (element.type as (props: unknown) => ReactElement)(element.props),
      )) as ReactElement)
    : (page as ReactElement);
}

const shareProps = (id: string, share: string) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({ share }),
});

it("keeps area filter variants noindex while retaining the canonical area", async () => {
  expect((await areaMetadata(areaProps)).robots).toBeUndefined();
  const filtered = await areaMetadata({
    ...areaProps,
    searchParams: Promise.resolve({ sort: "grade_desc", discipline: "boulder" }),
  });
  expect(filtered.robots).toEqual({ index: false });
  expect(filtered.alternates).toEqual({ canonical: "/areas/1/test-crag" });
});

async function seedSharedProfile() {
  await db.insert(climbs).values(
    [0, 1, 2, 3, 4, 5, 6].map((index) => ({
      id: 100 + index,
      areaId: 3,
      name: `Preview climb ${index}`,
      type: "sport" as const,
      grade: 10,
    })),
  );
  // Out of date order, so send ids can't pass for dates; climb 6 is undated.
  for (const index of [3, 0, 5, 6, 1, 4, 2]) {
    await seedFixtureSend(db, {
      userId: "hidden",
      climbId: 100 + index,
      dateSent: index === 6 ? null : `2026-0${index + 1}-15`,
      comment: index === 5 ? "Commentary sentinel" : null,
    });
  }
  await seedFixtureJournalEntry(db, {
    userId: "hidden",
    entryDate: "2026-07-01",
    body: "Journal sentinel",
  });
  return (await getProfileShareToken(db, "hidden"))!;
}

async function expectLocked(id: string, share: string) {
  expect(await userMetadata(shareProps(id, share))).toEqual({
    title: "Member content",
    robots: { index: false },
  });
  const page = await UserPage(shareProps(id, share));
  const html = renderToStaticMarkup(page);
  expect(html).toContain("For Betabook members");
  expect(html).not.toContain("identity sentinel");
  expect(JSON.stringify(page)).not.toContain("Preview climb");
}

it("renders public area descriptions and route grades without member statistics in props", async () => {
  const page = await AreaPage(areaProps);
  expect(page.type).toBe(PublicAreaPage);
  const area = await getPublicArea(db, 1);
  expect(area).toEqual({ id: 1, name: "Test Crag", parentId: null, description: "A test crag." });
  const content = await PublicAreaPage({ area: area!, search: {} });
  const serialized = JSON.stringify(content);
  expect(serialized).toContain("Test Highball");
  expect(serialized).toContain("Test Boulders");
  expect(serialized).toContain("A test crag.");
  expect(serialized).toContain('"grade":5');
  expect(serialized).toContain('"type":"boulder"');
  expect(serialized).not.toContain('"sendStats":');
  expect(serialized).not.toContain('"histogram":');
});
it("renders public route details and anonymized sends in the page and metadata", async () => {
  await seedFixtureUser(db, {
    id: "open",
    name: "Everyone climber sentinel",
    sendCommentVisibility: "everyone",
  });
  await seedFixtureSend(db, {
    userId: "hidden",
    climbId: 1,
    dateSent: "2026-08-14",
    comment: "Members beta sentinel",
  });
  await seedFixtureSend(db, {
    userId: "open",
    climbId: 1,
    dateSent: "2026-09-03",
    comment: "Everyone beta sentinel",
  });
  await seedFixtureUser(db, {
    id: "private",
    name: "Private climber sentinel",
    isPrivate: true,
    sendCommentVisibility: "everyone",
  });
  await seedFixtureSend(db, {
    userId: "private",
    climbId: 1,
    dateSent: "2026-07-21",
    comment: "Private beta sentinel",
  });
  const page = await ClimbPage(climbProps);
  expect(page.type).toBe(PublicClimbPage);
  const climb = await getPublicClimb(db, 1);
  const content = await PublicClimbPage({ climb: climb!, search: {} });
  const serialized = JSON.stringify(content);
  expect(serialized).toContain("Test Highball");
  expect(serialized).toContain("Public route description sentinel");
  expect(serialized).toContain('"type":"boulder"');
  const restricted = [
    "Restricted identity sentinel",
    "Members beta sentinel",
    "2026-08-14",
    "Private climber sentinel",
    "Private beta sentinel",
    "2026-07-21",
  ];
  for (const value of restricted) expect(serialized).not.toContain(value);
  expect(serialized).not.toContain('"userId"');
  expect(serialized).toContain('"dateSent":"2026-07"');
  const html = renderToStaticMarkup(content);
  expect(html).toContain("Everyone climber sentinel");
  expect(html).toContain("Everyone beta sentinel");
  expect(html).toContain("Sep 3, 2026");
  expect(html).toContain("Betabook climber");
  expect(html).toContain("Aug 2026");
  expect(html).not.toContain("Restricted identity sentinel");
  expect(html).not.toContain("Members beta sentinel");
  expect(html).toContain("For Betabook members");
  expect(html).toContain("V4");
  expect(html).toContain("Boulder");
  expect(html).toContain("Public route description sentinel");
  expect(html).not.toContain("this climb’s grade, description");
  expect(await climbMetadata(climbProps)).toMatchObject({
    title: "Test Highball · V4 · Test Highball Alcove",
    alternates: { canonical: "/climbs/1/test-highball" },
  });
  const metadata = await climbMetadata(climbProps);
  expect(metadata.description).toContain("Public route description sentinel");
  expect(metadata.openGraph).toMatchObject({ description: metadata.description });
  expect(metadata.twitter).toMatchObject({ description: metadata.description });
  expect(JSON.stringify(await areaMetadata(areaProps))).toContain("A test crag.");
});
it("does not reveal whether a profile exists in the page or metadata", async () => {
  for (const id of ["hidden", "missing"]) {
    const props = { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
    expect(await userMetadata(props)).toEqual({
      title: "Member content",
      robots: { index: false },
    });
    const html = renderToStaticMarkup(await UserPage(props));
    expect(html).toContain("For Betabook members");
    expect(html).not.toContain("Restricted identity sentinel");
  }
});
it("previews recent climbing signed out through the owner's current share link", async () => {
  const token = await seedSharedProfile();

  expect(await userMetadata(shareProps("hidden", token))).toMatchObject({
    title: { absolute: "Restricted identity sentinel on Betabook" },
    robots: { index: false },
  });
  const preview = await UserPage(shareProps("hidden", token));
  expect(preview.props).toMatchObject({
    owner: { id: "hidden", name: "Restricted identity sentinel", image: null, token },
    next: `/users/hidden?share=${token}`,
    children: { props: { sendCount: 7 } },
  });
  const serialized = JSON.stringify(preview);
  const shown = [...serialized.matchAll(/Preview climb (\d)/g)].map((match) => match[1]);
  expect(shown).toEqual(["5", "4", "3", "2", "1"]);
  expect(serialized).not.toContain("Commentary sentinel");
  expect(serialized).not.toContain("Journal sentinel");
  const html = renderToStaticMarkup(await framed(preview));
  // Same heading a signed-in user sees, with the sign-up invite in place of the
  // friend button.
  expect(html).toContain("Restricted identity sentinel</h1>");
  expect(html).toContain("Sign up to send Restricted identity sentinel a friend request");
  expect(html).toContain('aria-label="Profile sections"');
  expect(html).toContain("See all 7 sends");
  expect(html).not.toContain("invited you to");

  await db.update(user).set({ sendCommentVisibility: "everyone" }).where(eq(user.id, "hidden"));
  expect(JSON.stringify(await UserPage(shareProps("hidden", token)))).toContain(
    "Commentary sentinel",
  );
});
it("keeps the profile's sub-pages locked with a current share link", async () => {
  const token = await seedSharedProfile();

  for (const SubPage of [UserSendsPage, UserJournalPage, UserAnalyticsPage]) {
    const page = await SubPage(shareProps("hidden", token));
    expect(renderToStaticMarkup(page)).toContain("For Betabook members");
    expect(JSON.stringify(page)).not.toContain("Preview climb");
  }
});
/** A trip from March to May, covering the shared profile's sends on climbs 2, 3
 * and 4. */
async function seedSharedTrip() {
  const token = await seedSharedProfile();
  const trip = await seedFixtureTrip(db, {
    userId: "hidden",
    name: "Trip sentinel",
    description: "Description sentinel",
    notes: "Notes sentinel",
    startDate: "2026-03-01",
    endDate: "2026-05-31",
  });
  await seedFixtureJournalEntry(db, {
    userId: "hidden",
    entryDate: "2026-04-01",
    body: "Inside journal sentinel",
  });
  await seedFixtureUser(db, { id: "partner", name: "Tagged identity sentinel" });
  await seedFixtureFriendship(db, "hidden", "partner");
  const pair = friendshipPair("hidden", "partner");
  await db.insert(tripCompanions).values({
    tripId: trip.id,
    userId: "partner",
    friendshipUserId: pair.userId,
    friendshipFriendId: pair.friendId,
  });
  return { token, trip };
}

const tripProps = (id: string, tripId: number, share: string) => ({
  params: Promise.resolve({ id, tripId: String(tripId) }),
  searchParams: Promise.resolve({ share }),
});

const JOURNAL_SIDE = ["Journal sentinel", "Inside journal sentinel", "Tagged identity sentinel"];

it("opens the trips list and a trip through the share link", async () => {
  const { token, trip } = await seedSharedTrip();

  // The profile shows sends by default. Trips are on their own tab.
  const profile = JSON.stringify(await UserPage(shareProps("hidden", token)));
  expect(profile).not.toContain("Trip sentinel");

  expect(await tripsMetadata(shareProps("hidden", token))).toMatchObject({
    title: { absolute: "Restricted identity sentinel on Betabook" },
    robots: { index: false },
  });
  const list = JSON.stringify(await UserTripsPage(shareProps("hidden", token)));
  expect(list).toContain("Trip sentinel");
  expect(list).toContain("Description sentinel");
  expect(list).toContain('"sendCount":3');
  expect(list).toContain('"entryCount":null');
  // Trip links in the list include the share token.
  expect(list).toContain(`"shareToken":"${token}"`);
  expect(list).toContain('"canEdit":false');

  expect(await tripMetadata(tripProps("hidden", trip.id, token))).toMatchObject({
    title: { absolute: "Restricted identity sentinel on Betabook" },
    robots: { index: false },
  });
  const page = JSON.stringify(await TripPage(tripProps("hidden", trip.id, token)));
  expect(page).toContain("Trip sentinel");
  const shown = [...page.matchAll(/Preview climb (\d)/g)].map((match) => match[1]);
  expect([...new Set(shown)]).toEqual(["4", "3", "2"]);
  expect(page).not.toContain("Commentary sentinel");

  // Notes appear on the trip page, read-only.
  expect(page).toContain('"notes":"Notes sentinel"');
  expect(page).toContain('"canEdit":false');
  expect(page).not.toContain('"canEdit":true');
  for (const payload of [profile, list]) expect(payload).not.toContain("Notes sentinel");

  for (const hidden of JOURNAL_SIDE) {
    for (const payload of [profile, list, page]) expect(payload).not.toContain(hidden);
  }
});

it("shows a trip's album through the share link", async () => {
  const { token } = await seedSharedTrip();
  const album = "https://photos.app.goo.gl/Example1Album2Link3";
  const withAlbum = await seedFixtureTrip(db, {
    userId: "hidden",
    name: "Album trip",
    albumUrl: album,
    startDate: "2026-03-01",
    endDate: "2026-05-31",
  });

  const page = JSON.stringify(await TripPage(tripProps("hidden", withAlbum.id, token)));
  expect(page).toContain(`"link":"${album}"`);

  const locked = JSON.stringify(await TripPage(tripProps("hidden", withAlbum.id, "0".repeat(32))));
  expect(locked).not.toContain(album);
});

it("shows send comments through the share link only when shared with Everyone", async () => {
  const { token } = await seedSharedTrip();
  const season = await seedFixtureTrip(db, {
    userId: "hidden",
    name: "Season sentinel",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });

  const props = () => tripProps("hidden", season.id, token);
  expect(JSON.stringify(await TripPage(props()))).not.toContain("Commentary sentinel");

  await db.update(user).set({ sendCommentVisibility: "everyone" }).where(eq(user.id, "hidden"));
  expect(JSON.stringify(await TripPage(props()))).toContain("Commentary sentinel");
});

it("keeps trip analytics behind sign-in with a valid share link", async () => {
  const { token, trip } = await seedSharedTrip();

  const page = await TripAnalyticsPage(tripProps("hidden", trip.id, token));
  expect(renderToStaticMarkup(page)).toContain("For Betabook members");
  const payload = JSON.stringify(page);
  expect(payload).not.toContain("Trip sentinel");
  expect(payload).not.toContain("Preview climb");
});

it("shows no trip for unknown, mismatched, reset or private share links", async () => {
  await seedFixtureUser(db, { id: "other", name: "Other identity sentinel" });
  const { token, trip } = await seedSharedTrip();
  const otherToken = (await getProfileShareToken(db, "other"))!;

  async function expectLockedPage(page: Awaited<ReturnType<typeof TripPage>>) {
    expect(renderToStaticMarkup(page)).toContain("For Betabook members");
    const payload = JSON.stringify(page);
    expect(payload).not.toContain("sentinel");
    expect(payload).not.toContain("Preview climb");
  }

  async function expectTripsLocked(id: string, share: string) {
    await expectLockedPage(await UserTripsPage(shareProps(id, share)));
    await expectLockedPage(await TripPage(tripProps(id, trip.id, share)));
    expect(await tripMetadata(tripProps(id, trip.id, share))).toEqual({
      title: "Member content",
      robots: { index: false },
    });
  }

  await expectTripsLocked("hidden", "0".repeat(32));
  await expectTripsLocked("hidden", otherToken);
  // Another user's share link doesn't open this trip.
  await expectLockedPage(await TripPage(tripProps("other", trip.id, otherToken)));

  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "hidden"));
  await expectTripsLocked("hidden", token);
  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "hidden"));
  await expectTripsLocked("hidden", token);
});

it("shows nothing about the owner through unknown, mismatched, reset or private links", async () => {
  await seedFixtureUser(db, { id: "other", name: "Other identity sentinel" });
  const token = await seedSharedProfile();
  const otherToken = (await getProfileShareToken(db, "other"))!;

  await expectLocked("hidden", "0".repeat(32));
  await expectLocked("hidden", token.toUpperCase());
  await expectLocked("hidden", otherToken);
  await expectLocked("missing", token);

  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "hidden"));
  await expectLocked("hidden", token);
  await expectLocked("hidden", (await getProfileShareToken(db, "hidden"))!);
  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "hidden"));
  await expectLocked("hidden", token);
});
it("preserves public canonical redirects and missing-entity errors", async () => {
  await expect(
    ClimbPage({ ...climbProps, params: Promise.resolve({ id: "1", slug: ["stale"] }) }),
  ).rejects.toThrow("REDIRECT:/climbs/1/test-highball");
  await expect(AreaPage({ ...areaProps, params: Promise.resolve({ id: "999" }) })).rejects.toThrow(
    "NOT_FOUND",
  );
});
