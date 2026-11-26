import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { pinProject, unpinProject } from "@/actions";
import { createDb } from "@/db/client";
import { getPinnedProjects } from "@/db/queries/journal";
import { climbs, pinnedProjects, projectShareLinks } from "@/db/schema";
import { PINNED_PROJECT_LIMIT } from "@/lib/projects";
import {
  seedFixturePinnedProject,
  seedFixtureTree,
  seedFixtureUser,
  seedManyClimbs,
} from "@/test/fixtures";
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
const SLAB = 2; // Test Slab, from seedFixtureTree
const CRIMPER = 3;

/** Leaves exactly one free slot, so the next pin fits and the one after it
 * must not. Chunked because D1 caps bound parameters per statement. */
async function fillPinsToOneShortOfCap(): Promise<void> {
  const count = PINNED_PROJECT_LIMIT - 1;
  await seedManyClimbs(db, 5, count, 1000);
  const rows = Array.from({ length: count }, (_, i) => ({
    userId: "climber",
    climbId: 1000 + i,
    pinnedAt: "2025-01-01",
  }));
  for (let i = 0; i < rows.length; i += 12) {
    await db.insert(pinnedProjects).values(rows.slice(i, i + 12));
  }
}

async function pinnedClimbIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ climbId: pinnedProjects.climbId })
    .from(pinnedProjects)
    .where(eq(pinnedProjects.userId, userId));
  return rows.map(({ climbId }) => climbId).sort((a, b) => a - b);
}

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "climber" });
  await seedFixtureUser(db, { id: "other" });
  identity.id = "climber";
  limits.allow = true;
});

it("pins a climb for the signed-in climber and nobody else", async () => {
  const result = await pinProject(SLAB);

  expect(result).toEqual({ ok: true, value: undefined });
  expect(await pinnedClimbIds("climber")).toEqual([SLAB]);
  expect(await pinnedClimbIds("other")).toEqual([]);
});

it("puts the pinned climb on the owner's open board", async () => {
  await pinProject(SLAB);

  const projects = await getPinnedProjects(db, "climber", "climber", { sent: false });
  expect(projects.map(({ climbId }) => climbId)).toEqual([SLAB]);
  // Pinned, never climbed: the board still has to show it.
  expect(projects[0]).toMatchObject({ sessionCount: 0, lastSession: null, sent: false });
});

it("refuses to pin without a session and writes nothing", async () => {
  identity.id = null;

  const result = await pinProject(SLAB);

  expect(result.ok).toBe(false);
  expect(await pinnedClimbIds("climber")).toEqual([]);
});

it("refuses to unpin without a session and leaves the pin in place", async () => {
  await seedFixturePinnedProject(db, { userId: "climber", climbId: SLAB });
  identity.id = null;

  const result = await unpinProject(SLAB);

  expect(result.ok).toBe(false);
  expect(await pinnedClimbIds("climber")).toEqual([SLAB]);
});

it("does not touch another climber's pin", async () => {
  await seedFixturePinnedProject(db, { userId: "other", climbId: SLAB });

  const result = await unpinProject(SLAB);

  // Unpinning what you never pinned reports success — the end state holds —
  // but it must not reach across to somebody else's row.
  expect(result).toEqual({ ok: true, value: undefined });
  expect(await pinnedClimbIds("other")).toEqual([SLAB]);
});

it("treats a repeated pin as a no-op rather than an error", async () => {
  await pinProject(SLAB);
  const again = await pinProject(SLAB);

  expect(again).toEqual({ ok: true, value: undefined });
  expect(await pinnedClimbIds("climber")).toEqual([SLAB]);
});

it("rejects a climb that does not exist", async () => {
  const result = await pinProject(9999);

  expect(result).toEqual({ ok: false, error: "Climb not found" });
  expect(await pinnedClimbIds("climber")).toEqual([]);
});

it.each([0, -1, 1.5, Number.NaN])("rejects the invalid climb id %s", async (climbId) => {
  const result = await pinProject(climbId);

  expect(result).toEqual({ ok: false, error: "Climb not found" });
  expect(await pinnedClimbIds("climber")).toEqual([]);
});

it("refuses a pin past the cap and leaves the existing pins untouched", async () => {
  // One short of the cap in bulk, then two real pins: the first fits, the
  // second must be refused rather than silently dropped.
  await fillPinsToOneShortOfCap();

  expect(await pinProject(SLAB)).toEqual({ ok: true, value: undefined });
  const atCap = await pinProject(CRIMPER);

  expect(atCap.ok).toBe(false);
  if (atCap.ok) throw new Error("expected the pin to be refused at the cap");
  expect(atCap.error).toContain(String(PINNED_PROJECT_LIMIT));
  const after = await pinnedClimbIds("climber");
  expect(after).toHaveLength(PINNED_PROJECT_LIMIT);
  expect(after).toContain(SLAB);
  expect(after).not.toContain(CRIMPER);
});

it("still reports success for a duplicate pin at the cap", async () => {
  await fillPinsToOneShortOfCap();
  await pinProject(SLAB);

  // Full, but this climb is already pinned, so nothing is being added and the
  // climber should not be told the list is full.
  expect(await pinProject(SLAB)).toEqual({ ok: true, value: undefined });
});

it("removes the pin without disturbing the climber's other projects", async () => {
  await pinProject(SLAB);
  await pinProject(CRIMPER);

  const result = await unpinProject(SLAB);

  expect(result).toEqual({ ok: true, value: undefined });
  expect(await pinnedClimbIds("climber")).toEqual([CRIMPER]);
});

it("reports rate limiting instead of writing", async () => {
  limits.allow = false;

  const result = await pinProject(SLAB);

  expect(result.ok).toBe(false);
  expect(await pinnedClimbIds("climber")).toEqual([]);
});

it("drops the pin when the climb itself is deleted", async () => {
  await pinProject(SLAB);

  await db.delete(climbs).where(eq(climbs.id, SLAB));

  // A pin is a bookmark, not history: it has nothing to preserve once its
  // climb is gone, so it cascades rather than blocking the delete.
  expect(await pinnedClimbIds("climber")).toEqual([]);
});

it("takes the share link with the pin", async () => {
  await pinProject(SLAB);
  await db.insert(projectShareLinks).values({ userId: "climber", climbId: SLAB });

  const result = await unpinProject(SLAB);

  expect(result.ok).toBe(true);
  // The row goes with the pin through the composite foreign key, so the link
  // stops resolving for anyone holding it. Nothing has to purge a page:
  // /projects/[token] is dynamic and re-reads on every request.
  expect(await db.select().from(projectShareLinks).all()).toEqual([]);
});
