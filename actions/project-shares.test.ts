import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { shareProject, unshareProject } from "@/actions";
import { createDb } from "@/db/client";
import { getProjectShareForOwner, getSharedProject } from "@/db/queries";
import { projectShareLinks, user } from "@/db/schema";
import { seedFixturePinnedProject, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "climber" as string | null }));
const limits = vi.hoisted(() => ({ allow: true }));
vi.mock("next/cache", () => ({
  refresh: vi.fn<() => void>(),
  revalidatePath: vi.fn<() => void>(),
}));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!identity.id) throw new NotSignedInError();
      return { user: { id: identity.id } };
    },
  };
});
vi.mock("@/lib/rate-limit", () => ({ allowJournalWrite: async () => limits.allow }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);
const HIGHBALL = 1; // from seedFixtureTree
const SLAB = 2;

async function storedShares(userId = "climber") {
  return db.select().from(projectShareLinks).where(eq(projectShareLinks.userId, userId));
}

beforeEach(async () => {
  identity.id = "climber";
  limits.allow = true;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "climber", name: "Sharing Climber" });
  await seedFixtureUser(db, { id: "other", name: "Other Climber" });
  await seedFixturePinnedProject(db, { userId: "climber", climbId: HIGHBALL });
});

it("issues a link for a tracked project", async () => {
  const result = await shareProject(HIGHBALL, "friends", "30d");

  expect(result.ok).toBe(true);
  const stored = await storedShares();
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ climbId: HIGHBALL, audience: "friends" });
  expect(result.ok && result.value.token).toBe(stored[0].token);
  // The deadline is the database's, so it is a real timestamp in the future
  // in the format the expiry comparison depends on.
  expect(stored[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(new Date(`${stored[0].expiresAt!.replace(" ", "T")}Z`).getTime()).toBeGreaterThan(
    Date.now(),
  );
});

it("leaves no deadline on an indefinite link", async () => {
  await shareProject(HIGHBALL, "everyone", "never");

  expect((await storedShares())[0].expiresAt).toBeNull();
});

it("keeps the same token when the terms change", async () => {
  const first = await shareProject(HIGHBALL, "everyone", "never");
  const token = first.ok ? first.value.token : "";

  const second = await shareProject(HIGHBALL, "friends", "7d");

  expect(second.ok && second.value.token).toBe(token);
  const stored = await storedShares();
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ token, audience: "friends" });
  expect(stored[0].expiresAt).not.toBeNull();
});

it("refuses a climb the climber has not tracked", async () => {
  const result = await shareProject(SLAB, "everyone", "never");

  expect(result).toEqual({ ok: false, error: expect.stringContaining("Track this climb") });
  expect(await storedShares()).toEqual([]);
});

it("refuses another climber's project", async () => {
  await seedFixturePinnedProject(db, { userId: "other", climbId: SLAB });

  const result = await shareProject(SLAB, "everyone", "never");

  expect(result.ok).toBe(false);
  expect(await storedShares("other")).toEqual([]);
});

it("refuses while the profile is private, naming the setting", async () => {
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "climber"));

  const result = await shareProject(HIGHBALL, "everyone", "never");

  expect(result).toEqual({ ok: false, error: expect.stringContaining("private") });
  expect(await storedShares()).toEqual([]);
});

it.each([
  ["private", "never"],
  ["nobody", "never"],
  ["everyone", "1d"],
  ["everyone", ""],
])("refuses the audience/expiry pair %s/%s", async (audience, expiry) => {
  const result = await shareProject(HIGHBALL, audience, expiry);

  expect(result.ok).toBe(false);
  expect(await storedShares()).toEqual([]);
});

it("refuses a rate-limited climber without writing", async () => {
  limits.allow = false;

  const result = await shareProject(HIGHBALL, "everyone", "never");

  expect(result.ok).toBe(false);
  expect(await storedShares()).toEqual([]);
});

it("refuses a signed-out caller", async () => {
  identity.id = null;

  expect((await shareProject(HIGHBALL, "everyone", "never")).ok).toBe(false);
  expect((await unshareProject(HIGHBALL)).ok).toBe(false);
  expect(await storedShares()).toEqual([]);
});

it("closes the link on unshare and leaves the pin alone", async () => {
  const created = await shareProject(HIGHBALL, "everyone", "never");
  const token = created.ok ? created.value.token : "";

  const result = await unshareProject(HIGHBALL);

  expect(result.ok).toBe(true);
  expect(await storedShares()).toEqual([]);
  expect(await getSharedProject(db, token, null)).toBeNull();
  expect(await getProjectShareForOwner(db, "climber", HIGHBALL)).toBeNull();
});

it("treats unsharing something unshared as already done", async () => {
  expect(await unshareProject(HIGHBALL)).toEqual({ ok: true, value: undefined });
});

it("does not let one climber unshare another's project", async () => {
  await seedFixturePinnedProject(db, { userId: "other", climbId: SLAB });
  await db.insert(projectShareLinks).values({
    userId: "other",
    climbId: SLAB,
    audience: "everyone",
  });

  const result = await unshareProject(SLAB);

  expect(result.ok).toBe(true);
  expect(await storedShares("other")).toHaveLength(1);
});
