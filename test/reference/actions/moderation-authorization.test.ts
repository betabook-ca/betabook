import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { approveChangeRequest, rejectChangeRequest, requestAreaEdit } from "@/actions/moderation";
import { createDb } from "@/db/client";
import { adminAreaScopes, areas, changeRequestApprovals, changeRequests, user } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({
  beforeBatch: undefined as (() => Promise<void>) | undefined,
  beforeDescriptionReturns: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock("@/lib/email", () => ({ sendChangeRequestDecisionEmail: async () => {} }));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: "reviewer", role: "admin" } }),
  requireAdmin: async () => ({ user: { id: "reviewer", role: "admin" } }),
  isAdmin: () => true,
}));
vi.mock("@/lib/moderation", async (original) => {
  const actual = await original<typeof import("@/lib/moderation")>();
  return {
    ...actual,
    describeChangeRequest: async (...args: Parameters<typeof actual.describeChangeRequest>) => {
      const result = await actual.describeChangeRequest(...args);
      await state.beforeDescriptionReturns?.();
      return result;
    },
  };
});
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => {
      const db = actual.createDb(env.DB);
      const batch = db.batch.bind(db);
      db.batch = async (statements) => {
        const interleave = state.beforeBatch;
        state.beforeBatch = undefined;
        await interleave?.();
        return batch(statements);
      };
      return db;
    },
  };
});

const db = createDb(env.DB);
beforeEach(async () => {
  state.beforeBatch = undefined;
  state.beforeDescriptionReturns = undefined;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "reviewer", role: "admin" });
  await seedFixtureUser(db, { id: "requester" });
  await db.insert(adminAreaScopes).values({ userId: "reviewer", areaId: 1 });
});

it.each(["grant", "role", "ancestry"] as const)(
  "rejects a direct edit when its %s changes before commit",
  async (change) => {
    await db.insert(areas).values({ id: 90, name: "Unmanaged root" });
    state.beforeBatch = async () => {
      if (change === "grant") await db.delete(adminAreaScopes);
      else if (change === "role")
        await db.update(user).set({ role: null }).where(eq(user.id, "reviewer"));
      else await db.update(areas).set({ parentId: 90 }).where(eq(areas.id, 2));
    };
    const form = new FormData();
    form.set("name", "Stale rename");
    expect(await requestAreaEdit(4, form)).toMatchObject({ ok: false });
    expect(await db.select().from(areas).where(eq(areas.id, 4)).get()).toMatchObject({
      name: "Test Highball Alcove",
    });
    expect(await db.select().from(changeRequests)).toEqual([]);
    expect(await db.select().from(changeRequestApprovals)).toEqual([]);
  },
);

it("does not apply a move after a prior approver loses destination coverage", async () => {
  await db.delete(adminAreaScopes);
  await seedFixtureUser(db, { id: "destination-admin", role: "admin" });
  await db.insert(adminAreaScopes).values([
    { userId: "reviewer", areaId: 2 },
    { userId: "destination-admin", areaId: 3 },
  ]);
  const [request] = await db
    .insert(changeRequests)
    .values({
      type: "climb_move",
      entityId: 1,
      requestedBy: "requester",
      payload: JSON.stringify({ newAreaId: 3 }),
    })
    .returning();
  await db
    .insert(changeRequestApprovals)
    .values({ requestId: request.id, userId: "destination-admin" });
  state.beforeBatch = async () => {
    await db.delete(adminAreaScopes).where(eq(adminAreaScopes.userId, "destination-admin"));
  };
  expect(await approveChangeRequest(request.id)).toMatchObject({ ok: false });
  const { climbs } = await import("@/db/schema");
  expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toMatchObject({ areaId: 4 });
  expect(
    await db.select().from(changeRequests).where(eq(changeRequests.id, request.id)).get(),
  ).toMatchObject({ status: "pending" });
});

it("rejects a denial when the reviewer loses their grant before the decision write", async () => {
  const [request] = await db
    .insert(changeRequests)
    .values({
      type: "area_edit",
      entityId: 2,
      requestedBy: "requester",
      payload: '{"name":"New name"}',
    })
    .returning();
  state.beforeDescriptionReturns = async () => {
    await db.delete(adminAreaScopes);
  };
  expect(await rejectChangeRequest(request.id, "No")).toMatchObject({ ok: false });
  expect(
    await db.select().from(changeRequests).where(eq(changeRequests.id, request.id)).get(),
  ).toMatchObject({ status: "pending", reviewedBy: null });
});

it("leaves a move pending if its destination vanishes before a denial is written", async () => {
  await db.insert(areas).values({ id: 90, parentId: 1, name: "Destination" });
  const [request] = await db
    .insert(changeRequests)
    .values({
      type: "climb_move",
      entityId: 1,
      requestedBy: "requester",
      payload: '{"newAreaId":90}',
    })
    .returning();
  state.beforeDescriptionReturns = async () => {
    await db.delete(areas).where(eq(areas.id, 90));
  };
  expect(await rejectChangeRequest(request.id, "No")).toMatchObject({ ok: false });
  expect(
    await db.select().from(changeRequests).where(eq(changeRequests.id, request.id)).get(),
  ).toMatchObject({ status: "pending", reviewedBy: null });
});
