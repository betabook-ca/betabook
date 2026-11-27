import { describe, expect, it } from "vitest";

import {
  getAnnouncementCandidates,
  type FeatureAnnouncementDefinition,
} from "./feature-announcements";

const releases: FeatureAnnouncementDefinition[] = [1, 2, 3, 4, 5].map((month) => ({
  featureId: `feature-${month}`,
  launchedAt: `2026-0${month}-01T00:00:00Z`,
  page: "/analytics",
  title: `Feature ${month}`,
  description: "A newly launched feature.",
}));
const availableFeatureIds = releases.map((feature) => feature.featureId);
function candidates(joined: string, now = "2026-06-01T00:00:00Z", definitions = releases) {
  return getAnnouncementCandidates(definitions, {
    page: "/analytics",
    availableFeatureIds,
    userCreatedAt: new Date(joined),
    now: new Date(now),
  }).map((feature) => feature.featureId);
}

describe("announcement launch eligibility", () => {
  it("shows no historical announcements to a new account", () => {
    expect(candidates("2026-05-15T00:00:00Z")).toEqual([]);
  });
  it("shows only launches four and five to someone who joined after launch three", () => {
    expect(candidates("2026-03-15T00:00:00Z")).toEqual(["feature-4", "feature-5"]);
  });
  it("unlocks each launch at its timestamp, never before, for an older account", () => {
    expect(candidates("2025-12-01T00:00:00Z", "2026-03-31T23:59:59.999Z")).toEqual([
      "feature-1",
      "feature-2",
      "feature-3",
    ]);
    expect(candidates("2025-12-01T00:00:00Z", "2026-04-01T00:00:00Z")).toEqual([
      "feature-1",
      "feature-2",
      "feature-3",
      "feature-4",
    ]);
  });
  it("uses strict signup-before-launch timestamps, including equivalent time zones", () => {
    expect(candidates("2026-03-31T17:00:00-07:00")).toEqual(["feature-5"]);
    expect(candidates("2026-03-31T23:59:59.999Z")).toEqual(["feature-4", "feature-5"]);
  });
  it("sorts eligible releases oldest first independently of registry order or copy edits", () => {
    expect(
      candidates(
        "2026-03-15T00:00:00Z",
        undefined,
        releases.toReversed().map((feature) => ({ ...feature, title: "Edited title" })),
      ),
    ).toEqual(["feature-4", "feature-5"]);
  });
  it("excludes other pages, unavailable targets, and invalid dates", () => {
    const definitions = [
      ...releases,
      { ...releases[0], featureId: "elsewhere", page: "/journal" },
      { ...releases[0], featureId: "invalid", launchedAt: "bad date" },
    ];
    expect(
      getAnnouncementCandidates(definitions, {
        page: "/analytics",
        availableFeatureIds: ["feature-4", "elsewhere", "invalid"],
        userCreatedAt: new Date("2026-03-15T00:00:00Z"),
        now: new Date("2026-06-01T00:00:00Z"),
      }).map((feature) => feature.featureId),
    ).toEqual(["feature-4"]);
    expect(candidates("invalid date")).toEqual([]);
  });
});
