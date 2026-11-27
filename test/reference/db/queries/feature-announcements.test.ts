import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { featureAnnouncementDismissals } from "@/db/schema";
import {
  getAnnouncementCandidates,
  type FeatureAnnouncementDefinition,
} from "@/lib/feature-announcements";
import { seedFixtureUser } from "@/test/fixtures";

import { loadViewerFeatureAnnouncements } from "./feature-announcements";

const db = createDb(env.DB);
const definitions: FeatureAnnouncementDefinition[] = [1, 2, 3, 4, 5].map((month) => ({
  featureId: `feature-${month}`,
  launchedAt: `2026-0${month}-01T00:00:00Z`,
  page: "/analytics",
  title: `Feature ${month}`,
  description: "New feature.",
}));
const options = {
  definitions,
  page: "/analytics",
  availableFeatureIds: definitions.map((feature) => feature.featureId),
  now: new Date("2026-06-01T00:00:00Z"),
};
const old = { id: "announcement-old", createdAt: new Date("2025-12-01T00:00:00Z") };
const middle = { id: "announcement-middle", createdAt: new Date("2026-03-15T00:00:00Z") };
const recent = { id: "announcement-new", createdAt: new Date("2026-06-01T00:00:00Z") };
beforeAll(async () => {
  for (const viewer of [old, middle, recent]) await seedFixtureUser(db, viewer);
});
beforeEach(async () => {
  await db.delete(featureAnnouncementDismissals);
});
afterEach(() => vi.restoreAllMocks());

it("loads five releases with one read and scopes dismissal to the viewer", async () => {
  await db.insert(featureAnnouncementDismissals).values([
    { userId: old.id, featureId: "feature-2" },
    { userId: middle.id, featureId: "feature-4" },
  ]);
  const select = vi.spyOn(db, "select");
  expect(
    (await loadViewerFeatureAnnouncements(db, old, options)).map((feature) => feature.featureId),
  ).toEqual(["feature-1", "feature-3", "feature-4", "feature-5"]);
  expect(select).toHaveBeenCalledTimes(1);
});

it("offers only undismissed post-signup launches for a user who joined after feature three", async () => {
  await db.insert(featureAnnouncementDismissals).values([
    { userId: old.id, featureId: "feature-5" },
    { userId: middle.id, featureId: "feature-4" },
  ]);
  expect(
    (await loadViewerFeatureAnnouncements(db, middle, options)).map((feature) => feature.featureId),
  ).toEqual(["feature-5"]);
  expect(
    await loadViewerFeatureAnnouncements(db, middle, {
      ...options,
      now: new Date("2026-04-30T23:59:59Z"),
    }),
  ).toEqual([]);
});

it("performs no read or write for new users, future-only releases, or an empty registry", async () => {
  const select = vi.spyOn(db, "select");
  expect(await loadViewerFeatureAnnouncements(db, recent, options)).toEqual([]);
  expect(
    await loadViewerFeatureAnnouncements(db, old, {
      ...options,
      now: new Date("2025-12-15T00:00:00Z"),
    }),
  ).toEqual([]);
  expect(await loadViewerFeatureAnnouncements(db, old, { ...options, definitions: [] })).toEqual(
    [],
  );
  expect(select).not.toHaveBeenCalled();
  select.mockRestore();
  expect(await db.select().from(featureAnnouncementDismissals)).toEqual([]);
});

it("reuses a viewer snapshot for multiple pages without more database reads", async () => {
  const elsewhere = { ...definitions[0], featureId: "journal-new", page: "/journal" };
  const select = vi.spyOn(db, "select");
  const announcements = await loadViewerFeatureAnnouncements(db, old, {
    ...options,
    definitions: [...definitions, elsewhere],
  });
  expect(
    getAnnouncementCandidates(announcements, {
      ...options,
      userCreatedAt: old.createdAt,
      availableFeatureIds: ["feature-4"],
    }).map((feature) => feature.featureId),
  ).toEqual(["feature-4"]);
  expect(
    getAnnouncementCandidates(announcements, {
      ...options,
      userCreatedAt: old.createdAt,
      page: "/journal",
      availableFeatureIds: ["journal-new"],
    }).map((feature) => feature.featureId),
  ).toEqual(["journal-new"]);
  expect(select).toHaveBeenCalledTimes(1);
});

it("reads fresh dismissals on a later load", async () => {
  expect(
    (await loadViewerFeatureAnnouncements(db, middle, options)).map((feature) => feature.featureId),
  ).toEqual(["feature-4", "feature-5"]);
  await db
    .insert(featureAnnouncementDismissals)
    .values({ userId: middle.id, featureId: "feature-4" });
  expect(
    (await loadViewerFeatureAnnouncements(db, middle, options)).map((feature) => feature.featureId),
  ).toEqual(["feature-5"]);
});
