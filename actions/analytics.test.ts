import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { saveAnalyticsLayout } from "@/actions/analytics";
import { createDb } from "@/db/client";
import { getAnalyticsLayout } from "@/db/queries/analytics-layout";
import { user, userAnalyticsLayouts } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { DEFAULT_ANALYTICS_LAYOUT, type AnalyticsLayout } from "@/lib/analytics-layout";
import { seedFixtureUser } from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "owner" as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const custom: AnalyticsLayout = {
  ...DEFAULT_ANALYTICS_LAYOUT,
  cards: ["hardest", ...DEFAULT_ANALYTICS_LAYOUT.cards.filter((id) => id !== "hardest")],
};
beforeEach(async () => {
  sessionState.userId = "owner";
  await db.delete(user);
  await seedFixtureUser(db, { id: "owner" });
  await seedFixtureUser(db, { id: "other" });
});
it("persists and replaces only the signed-in user's layout, including across a fresh read", async () => {
  await db.insert(userAnalyticsLayouts).values({ userId: "other", layout: custom });
  expect(await saveAnalyticsLayout(custom)).toEqual({ ok: true, value: undefined });
  expect(await getAnalyticsLayout(createDb(env.DB), "owner", "owner")).toEqual(custom);
  expect(await saveAnalyticsLayout(DEFAULT_ANALYTICS_LAYOUT)).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await getAnalyticsLayout(db, "owner", "owner")).toEqual(DEFAULT_ANALYTICS_LAYOUT);
  expect(await db.select().from(userAnalyticsLayouts).orderBy(userAnalyticsLayouts.userId)).toEqual(
    [
      { userId: "other", layout: custom },
      { userId: "owner", layout: DEFAULT_ANALYTICS_LAYOUT },
    ],
  );
});
it("rejects signed-out saves without changing saved preferences", async () => {
  await db.insert(userAnalyticsLayouts).values({ userId: "owner", layout: custom });
  sessionState.userId = null;
  expect(await saveAnalyticsLayout(DEFAULT_ANALYTICS_LAYOUT)).toEqual({
    ok: false,
    error: SESSION_EXPIRED_MESSAGE,
  });
  expect(await getAnalyticsLayout(db, "owner", "owner")).toEqual(custom);
});
it("rejects invalid IDs, missing fields, and attempts to supply another user ID", async () => {
  for (const value of [
    {},
    { ...custom, cards: ["unknown"] },
    { ...custom, cards: ["sends", "sends"] },
    { ...custom, charts: ["sends"] },
    { ...custom, hidden: [] },
    { ...custom, userId: "other" },
  ]) {
    expect((await saveAnalyticsLayout(value as AnalyticsLayout)).ok).toBe(false);
  }
  expect(await db.select().from(userAnalyticsLayouts)).toEqual([]);
});
it("does not disclose another user's layout, and account deletion removes it", async () => {
  await db.insert(userAnalyticsLayouts).values({ userId: "owner", layout: custom });
  expect(await getAnalyticsLayout(db, "owner", "other")).toEqual(DEFAULT_ANALYTICS_LAYOUT);
  expect(await getAnalyticsLayout(db, "owner", null)).toEqual(DEFAULT_ANALYTICS_LAYOUT);
  expect(await getAnalyticsLayout(db, "owner", "owner")).toEqual(custom);
  await db.delete(user).where(eq(user.id, "owner"));
  expect(await db.select().from(userAnalyticsLayouts)).toEqual([]);
});

it("starts fresh for obsolete stored layouts and replaces them with the single current shape", async () => {
  const oldLayout = { version: 2, cards: ["partner"], charts: ["volume"] };
  await db.run(
    sql`INSERT INTO user_analytics_layouts (user_id, layout) VALUES (${"owner"}, ${JSON.stringify(oldLayout)})`,
  );
  expect(await getAnalyticsLayout(db, "owner", "owner")).toEqual(DEFAULT_ANALYTICS_LAYOUT);
  const layout = { cards: ["partner", "sends"], charts: ["volume"] };
  expect(await saveAnalyticsLayout({ cards: ["partner", "sends"], charts: ["volume"] })).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await db.select().from(userAnalyticsLayouts)).toEqual([{ userId: "owner", layout }]);
  expect(await getAnalyticsLayout(createDb(env.DB), "owner", "owner")).toEqual(layout);
  for (const version of [1, 2]) {
    expect((await saveAnalyticsLayout({ ...layout, version } as AnalyticsLayout)).ok).toBe(false);
    expect(await db.select().from(userAnalyticsLayouts)).toEqual([{ userId: "owner", layout }]);
  }
});
