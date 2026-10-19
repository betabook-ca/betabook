import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { shareTrip, unshareTrip } from "@/actions";
import { createDb } from "@/db/client";
import { getSharedTrip, getTripShareForOwner } from "@/db/queries";
import { tripShareLinks } from "@/db/schema";
import { seedFixtureTree, seedFixtureTrip, seedFixtureUser } from "@/test/fixtures";
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
const BISHOP = { startDate: "2026-03-10", endDate: "2026-03-20" };

let tripId = 0;
let theirTripId = 0;

async function storedShares(userId = "climber") {
  return db.select().from(tripShareLinks).where(eq(tripShareLinks.userId, userId));
}

beforeEach(async () => {
  identity.id = "climber";
  limits.allow = true;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "climber", name: "Sharing Climber" });
  await seedFixtureUser(db, { id: "other", name: "Other Climber" });
  tripId = (await seedFixtureTrip(db, { userId: "climber", name: "Bishop", ...BISHOP })).id;
  theirTripId = (await seedFixtureTrip(db, { userId: "other", name: "Squamish", ...BISHOP })).id;
});

describe("sharing a trip", () => {
  it("creates a link and returns the deadline the database computed", async () => {
    const result = await shareTrip(tripId, "30d");
    expect(result.ok).toBe(true);

    const [stored] = await storedShares();
    expect(result.ok && result.value.token).toBe(stored.token);
    expect(stored.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect((await getSharedTrip(db, stored.token)).status).toBe("visible");
  });

  it("leaves a never-expiring link with no deadline at all", async () => {
    await shareTrip(tripId, "never");
    const [stored] = await storedShares();
    expect(stored.expiresAt).toBeNull();
  });

  it("keeps the token when the link is renewed, so what was sent goes on working", async () => {
    const first = await shareTrip(tripId, "7d");
    const renewed = await shareTrip(tripId, "6mo");

    expect(first.ok && renewed.ok && renewed.value.token).toBe(first.ok ? first.value.token : "");
    expect(await storedShares()).toHaveLength(1);
    expect(first.ok && renewed.ok && renewed.value.expiresAt).not.toBe(
      first.ok ? first.value.expiresAt : null,
    );
  });

  it("refuses an expiry that is not one of the offered options", async () => {
    expect(await shareTrip(tripId, "forever")).toMatchObject({ ok: false });
    expect(await shareTrip(tripId, "+1 day")).toMatchObject({ ok: false });
    expect(await storedShares()).toHaveLength(0);
  });

  it("refuses another climber's trip, and writes nothing", async () => {
    const result = await shareTrip(theirTripId, "30d");
    expect(result).toMatchObject({ ok: false, error: "Trip not found" });
    expect(await storedShares()).toHaveLength(0);
    expect(await storedShares("other")).toHaveLength(0);
  });

  it("refuses while the profile is private, and says so", async () => {
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = 'climber'`);

    const result = await shareTrip(tripId, "30d");
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/private/i) });
    expect(await storedShares()).toHaveLength(0);
  });

  it("does not reveal whether a stranger's profile is private", async () => {
    await db.run(sql`UPDATE user SET is_private = 1 WHERE id = 'other'`);

    // Same message as a trip that does not exist: a guessed id must not be a
    // way to learn about someone else's account.
    expect(await shareTrip(theirTripId, "30d")).toMatchObject({
      ok: false,
      error: "Trip not found",
    });
  });

  it("refuses a signed-out caller and a throttled one", async () => {
    identity.id = null;
    expect((await shareTrip(tripId, "30d")).ok).toBe(false);

    identity.id = "climber";
    limits.allow = false;
    expect(await shareTrip(tripId, "30d")).toMatchObject({
      ok: false,
      error: "Too many changes — try again in a minute",
    });
    expect(await storedShares()).toHaveLength(0);
  });
});

describe("stopping a share", () => {
  it("removes the link, and the trip survives it", async () => {
    await shareTrip(tripId, "30d");
    const [stored] = await storedShares();

    expect((await unshareTrip(tripId)).ok).toBe(true);
    expect(await storedShares()).toHaveLength(0);
    expect(await getSharedTrip(db, stored.token)).toEqual({ status: "hidden" });
    expect(await getTripShareForOwner(db, "climber", tripId)).toBeNull();
  });

  it("treats unsharing something already unshared as the end state it asked for", async () => {
    expect((await unshareTrip(tripId)).ok).toBe(true);
  });

  it("refuses to unshare another climber's trip", async () => {
    await db.insert(tripShareLinks).values({ userId: "other", tripId: theirTripId });

    await unshareTrip(theirTripId);
    expect(await storedShares("other")).toHaveLength(1);
  });
});
