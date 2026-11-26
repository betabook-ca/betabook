import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import {
  approveChangeRequest,
  requestClimbEdit,
  requestAreaEdit,
  requestAreaDelete,
} from "@/actions/moderation";
import { applyClimbEdit, applyAreaEdit } from "@/actions/moderation-apply";
import { createDb } from "@/db/client";
import {
  adminAreaScopes,
  areas,
  changeRequestApprovals,
  changeRequests,
  climbs,
} from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({
  id: "requester",
  role: null as string | null,
  failRefresh: false,
}));
vi.mock("next/cache", () => ({
  refresh: () => {
    if (state.failRefresh) throw new Error("audit cache failure after commit");
  },
  revalidatePath: () => {},
}));
vi.mock("@/lib/email", () => ({ sendChangeRequestDecisionEmail: async () => {} }));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: state.id, role: state.role } }),
  requireAdmin: async () => ({ user: { id: state.id, role: state.role } }),
  isAdmin: (session: { user: { role?: string | null } }) => session.user.role === "admin",
}));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "requester" });
  await seedFixtureUser(db, { id: "reviewer", role: "admin" });
  await db.insert(adminAreaScopes).values({ userId: "reviewer", areaId: 1 });
  state.id = "requester";
  state.role = null;
  state.failRefresh = false;
});

it.each([11, 30])("rejects queued grade %i after its discipline changes", async (grade) => {
  const form = new FormData();
  form.set("name", "Test Crimper");
  form.set("type", "sport");
  form.set("grade", String(grade));
  expect(await requestClimbEdit(3, form)).toEqual({ ok: true, value: { status: "pending" } });
  const request = await db.select().from(changeRequests).get();
  expect(JSON.parse(request!.payload)).toMatchObject({ grade });
  await applyClimbEdit(db, 3, { type: "boulder", grade: 5 });
  state.id = "reviewer";
  state.role = "admin";
  const result = await approveChangeRequest(request!.id);
  const climb = await db.select().from(climbs).where(eq(climbs.id, 3)).get();
  expect({ result, type: climb!.type, grade: climb!.grade }).toMatchObject({
    result: { ok: false },
    type: "boulder",
    grade: 5,
  });
});

it("does not leave a failed apply recorded as approved", async () => {
  const [request] = await db
    .insert(changeRequests)
    .values({
      type: "area_edit",
      entityId: 3,
      payload: JSON.stringify({ name: "Changed" }),
      requestedBy: "requester",
    })
    .returning();
  state.id = "reviewer";
  state.role = "admin";
  await db.run(sql`CREATE TRIGGER audit_fail_apply BEFORE UPDATE OF name ON areas
    BEGIN SELECT RAISE(ABORT, 'audit simulated database failure'); END`);
  try {
    expect((await approveChangeRequest(request.id)).ok).toBe(false);
    expect((await db.select().from(areas).where(eq(areas.id, 3)).get())!.name).toBe(
      "Test Sport Wall",
    );
    expect(
      (await db.select().from(changeRequests).where(eq(changeRequests.id, request.id)).get())!
        .status,
    ).toBe("pending");
  } finally {
    await db.run(sql`DROP TRIGGER audit_fail_apply`);
  }
});

it("rolls back a direct edit when its audit record cannot be saved", async () => {
  state.id = "reviewer";
  state.role = "admin";
  const form = new FormData();
  form.set("name", "Changed");
  await db.run(sql`CREATE TRIGGER audit_fail_record BEFORE INSERT ON change_requests
    BEGIN SELECT RAISE(ABORT, 'audit record unavailable'); END`);
  try {
    expect((await requestAreaEdit(3, form)).ok).toBe(false);
    expect((await db.select().from(areas).where(eq(areas.id, 3)).get())!.name).toBe(
      "Test Sport Wall",
    );
  } finally {
    await db.run(sql`DROP TRIGGER audit_fail_record`);
  }
});

it("rolls back deletion when orphan-request cleanup fails", async () => {
  await db.insert(areas).values({ id: 50, parentId: 1, name: "Leaf" });
  await db.insert(changeRequests).values({
    type: "area_edit",
    entityId: 50,
    payload: '{"name":"Later"}',
    requestedBy: "requester",
  });
  state.id = "reviewer";
  state.role = "admin";
  await db.run(sql`CREATE TRIGGER audit_fail_cleanup BEFORE UPDATE OF status ON change_requests
    WHEN NEW.status = 'rejected'
    BEGIN SELECT RAISE(ABORT, 'cleanup failed'); END`);
  try {
    expect((await requestAreaDelete(50)).ok).toBe(false);
    expect(await db.select().from(areas).where(eq(areas.id, 50)).get()).toMatchObject({
      name: "Leaf",
    });
    expect(
      await db.select().from(changeRequests).where(eq(changeRequests.status, "approved")),
    ).toHaveLength(0);
  } finally {
    await db.run(sql`DROP TRIGGER audit_fail_cleanup`);
  }
});

it("returns success when a committed moderation edit cannot refresh the page", async () => {
  const [request] = await db
    .insert(changeRequests)
    .values({
      type: "area_edit",
      entityId: 3,
      payload: JSON.stringify({ name: "Saved" }),
      requestedBy: "requester",
    })
    .returning();
  state.id = "reviewer";
  state.role = "admin";
  state.failRefresh = true;
  expect(await approveChangeRequest(request.id)).toMatchObject({ ok: true });
  expect(await db.select().from(areas).where(eq(areas.id, 3)).get()).toMatchObject({
    name: "Saved",
  });
  expect(
    await db.select().from(changeRequests).where(eq(changeRequests.id, request.id)).get(),
  ).toMatchObject({ status: "approved" });
});

it("rolls back a stale review even when the reviewer already voted", async () => {
  const [request] = await db
    .insert(changeRequests)
    .values({
      type: "area_edit",
      entityId: 3,
      payload: JSON.stringify({ name: "Stale" }),
      requestedBy: "requester",
    })
    .returning();
  await db.insert(changeRequestApprovals).values({ requestId: request.id, userId: "reviewer" });
  await db
    .update(changeRequests)
    .set({ status: "rejected" })
    .where(eq(changeRequests.id, request.id));
  await expect(
    applyAreaEdit(db, 3, { name: "Stale" }, { request, reviewerId: "reviewer" }),
  ).rejects.toThrow("changed");
  expect(await db.select().from(areas).where(eq(areas.id, 3)).get()).toMatchObject({
    name: "Test Sport Wall",
  });
  expect(
    await db.select().from(changeRequests).where(eq(changeRequests.id, request.id)).get(),
  ).toMatchObject({ status: "rejected" });
});

it("rejects a direct grade edit prepared for a different discipline", async () => {
  await expect(
    applyClimbEdit(
      db,
      1,
      { grade: 11, expectedType: "sport" },
      {
        type: "climb_edit",
        entityId: 1,
        payload: { grade: 11 },
        reviewerId: "reviewer",
      },
    ),
  ).rejects.toThrow("discipline");
  expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toMatchObject({
    type: "boulder",
    grade: 5,
  });
  expect(await db.select().from(changeRequests)).toEqual([]);
});
