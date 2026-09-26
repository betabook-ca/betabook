import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { prepareRecapShare } from "@/actions/recap-share";
import { createDb } from "@/db/client";
import { getRecapShare } from "@/db/queries";
import { journalEntries, recapShares, sends, user } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const sessionState = vi.hoisted(() => ({ userId: "owner" as string | null }));
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
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ cf: { timezone: "UTC" } }),
}));

const db = createDb(env.DB);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
  sessionState.userId = "owner";
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Recap Owner" });
  await seedFixtureTree(db);
  await seedFixtureSend(db, {
    userId: "owner",
    climbId: 1,
    dateSent: "2026-09-01",
    suggestedGrade: 5,
    rating: 5,
  });
  await db.insert(journalEntries).values([
    { id: 7001, userId: "owner", kind: "session", climbId: 1, entryDate: "2026-09-01" },
    { id: 7002, userId: "owner", kind: "session", climbId: 1, entryDate: "2026-09-01" },
  ]);
});

afterEach(() => vi.useRealTimers());

it("issues an owner-only frozen recap containing graded and rated climbs", async () => {
  const result = await prepareRecapShare();
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.path).toMatch(/^\/r\/[A-Za-z0-9_-]{22}$/);
  const share = await getRecapShare(db, result.value.token);
  expect(share?.snapshot).toMatchObject({
    version: 1,
    owner: { name: "Recap Owner", initials: "RO" },
    stats: {
      sendCount: 1,
      disciplines: [
        {
          type: "boulder",
          sendCount: 1,
          hardest: { grade: "V4", climbName: "Test Highball" },
          favorites: [{ climbName: "Test Highball", rating: 5, grade: "V4" }],
        },
      ],
      highlights: [
        { id: "mostSessioned", value: "Test Highball", detail: "2 sessions" },
        { id: "busiestDay", value: "2 sessions", detail: "Sep 1, 2026" },
      ],
      favoriteClimbs: [{ climbName: "Test Highball", rating: 5, grade: "V4" }],
    },
  });

  const repeated = await prepareRecapShare();
  expect(repeated).toEqual(result);

  await db.update(sends).set({ rating: 1, suggestedGrade: 2 }).where(eq(sends.userId, "owner"));
  expect((await getRecapShare(db, result.value.token))?.snapshot).toEqual(share?.snapshot);
  const changed = await prepareRecapShare();
  expect(changed.ok).toBe(true);
  if (!changed.ok) return;
  expect(changed.value.token).not.toBe(result.value.token);
  expect((await getRecapShare(db, changed.value.token))?.snapshot.stats.disciplines).toMatchObject([
    { hardest: { grade: "V1" }, favorites: [{ rating: 1 }] },
  ]);
});

it("rejects signed-out, private, and out-of-season requests without issuing a grant", async () => {
  sessionState.userId = null;
  expect(await prepareRecapShare()).toEqual({
    ok: false,
    error: SESSION_EXPIRED_MESSAGE,
  });
  sessionState.userId = "owner";
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  expect(await prepareRecapShare()).toEqual({
    ok: false,
    error: "Make your profile public to share a linked recap.",
  });
  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
  vi.setSystemTime(new Date("2026-11-30T12:00:00Z"));
  expect(await prepareRecapShare()).toEqual({
    ok: false,
    error: "Year in review is available in December.",
  });
  expect(await db.select().from(recapShares)).toEqual([]);
});
