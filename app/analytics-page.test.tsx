import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import UserAnalyticsPage, { generateMetadata } from "@/app/users/[id]/analytics/page";
import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { DisciplineScopeNav } from "@/components/discipline-scope-nav";
import { LogEntryButton } from "@/components/journal";
import {
  NavigationPendingProvider,
  NavigationPendingRegion,
} from "@/components/navigation-pending";
import { EmptyState } from "@/components/ui/empty-state";
import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const session = vi.hoisted(() => ({ userId: "owner" as string | null }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env, cf: { timezone: "UTC" } }),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({
  getMemberSession: async () =>
    session.userId
      ? { user: { id: session.userId, createdAt: new Date("2026-01-01T00:00:00Z") } }
      : null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
}));

const db = createDb(env.DB);
beforeEach(async () => {
  session.userId = "owner";
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", name: "Analytics Owner" });
  await seedFixtureUser(db, { id: "member" });
});

const props = (search: Record<string, string> = {}) => ({
  params: Promise.resolve({ id: "owner" }),
  searchParams: Promise.resolve(search),
});

type Element = ReactElement<Record<string, unknown>>;

/** The first element of `type` in the unrendered tree, looking through every
 * prop (children, periodPicker, cta) since the page nests one server
 * component inside another. */
function find(node: unknown, type: unknown): Element | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (node.type === type) return node;
  for (const value of Object.values(node.props)) {
    const hit = find(value, type);
    if (hit) return hit;
  }
  return null;
}

async function seedTwoDisciplines() {
  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-03-01" });
  await seedFixtureSend(db, { userId: "owner", climbId: 3, dateSent: "2026-03-02" });
}

it("hands the header only profile fields and scopes the dashboard through the shared switch", async () => {
  await seedTwoDisciplines();

  const page = await UserAnalyticsPage(props({ discipline: "sport" }));
  const header = find(page, ProfileHeader)!;
  expect(header.props.user).toEqual({
    id: "owner",
    name: "Analytics Owner",
    image: null,
    isPrivate: false,
  });
  expect(header.props.workspace).toBe("progress");

  const dashboard = find(
    find(find(page, NavigationPendingProvider), NavigationPendingRegion),
    AnalyticsDashboard,
  )!;
  expect(dashboard.props.scope).toBe("sport");
  const nav = find(dashboard.props.periodPicker, DisciplineScopeNav)!;
  expect(nav.props).toMatchObject({ present: ["boulder", "sport"], scope: "sport" });
  expect((nav.props.href as (type: string) => string)("boulder")).toBe(
    "/users/owner/analytics?discipline=boulder",
  );

  const defaulted = find(await UserAnalyticsPage(props()), DisciplineScopeNav)!;
  expect(defaulted.props.scope).toBe("boulder");
});

it("offers the owner a way to log from an empty dashboard, but not a visitor", async () => {
  const owner = await UserAnalyticsPage(props());
  const empty = find(find(owner, NavigationPendingRegion), EmptyState)!;
  expect(empty.props.message).toBe("No sends or sessions yet.");
  expect(find(empty, LogEntryButton)).not.toBeNull();
  expect(find(owner, NavigationPendingProvider)).not.toBeNull();

  const filtered = find(await UserAnalyticsPage(props({ tag: "project" })), EmptyState)!;
  expect(filtered.props.message).toBe("Nothing matches these tags.");
  expect(find(filtered, LogEntryButton)).toBeNull();

  session.userId = "member";
  const visitor = await UserAnalyticsPage(props());
  expect(find(find(visitor, EmptyState), LogEntryButton)).toBeNull();
  expect(find(visitor, ProfileHeader)!.props.user).not.toHaveProperty("email");
});

it("keeps the page and its metadata behind sign-in and canViewUser", async () => {
  expect(await generateMetadata(props())).toEqual({
    title: "Analytics Owner · Analytics",
    robots: { index: false },
  });

  session.userId = null;
  expect((await UserAnalyticsPage(props())).type).toBe(CurrentPageAuthCallout);
  expect(await generateMetadata(props())).toEqual({
    title: "Member content",
    robots: { index: false },
  });

  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  session.userId = "member";
  await expect(UserAnalyticsPage(props())).rejects.toThrow("Not found");
  await expect(generateMetadata(props())).rejects.toThrow("Not found");
  session.userId = "owner";
  expect(find(await UserAnalyticsPage(props()), ProfileHeader)!.props.user).toMatchObject({
    isPrivate: true,
  });
});
