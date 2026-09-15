import { env } from "cloudflare:test";
import type { ComponentProps, ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import GoalsPage, { generateMetadata } from "@/app/users/[id]/goals/page";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { GoalPanel } from "@/components/goals/goal-panel";
import { createDb } from "@/db/client";
import { goals } from "@/db/schema";
import { seedFixtureUser } from "@/test/fixtures";
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
  getMemberSession: async () => (session.userId ? { user: { id: session.userId } } : null),
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
  await seedFixtureUser(db, { id: "owner" });
  await seedFixtureUser(db, { id: "member" });
  await db.insert(goals).values({
    userId: "owner",
    kind: "training",
    target: 2,
    timeframe: "custom",
    repeat: "none",
    startDate: "2020-01-01",
    endDate: "2099-12-31",
    timezone: "UTC",
  });
});
const params = () => Promise.resolve({ id: "owner" });
it("opens an expanded Goals page with the owner's actual goals", async () => {
  const page = (await GoalsPage({ params: params() })) as ReactElement<{
    workspace: string;
    children: ReactElement<ComponentProps<typeof GoalPanel>>;
  }>;
  expect(page.props.workspace).toBe("progress");
  expect(page.props.children.type).toBe(GoalPanel);
  expect(page.props.children.props.ownerId).toBe("owner");
  expect(page.props.children.props.initialActive.goals).toHaveLength(1);
  expect(page.props.children.props.initialActive.goals[0]).toMatchObject({
    kind: "training",
    target: 2,
    progress: 0,
  });
});
it("requires sign-in before showing goals", async () => {
  session.userId = null;
  expect(((await GoalsPage({ params: params() })) as ReactElement).type).toBe(
    CurrentPageAuthCallout,
  );
});
it("denies another member in both the page and metadata", async () => {
  session.userId = "member";
  await expect(GoalsPage({ params: params() })).rejects.toThrow("Not found");
  await expect(generateMetadata({ params: params() })).rejects.toThrow("Not found");
});
