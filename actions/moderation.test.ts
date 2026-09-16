import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveChangeRequest,
  rejectChangeRequest,
  requestAreaDelete,
  requestAreaEdit,
  requestAreaReparent,
  requestClimbDelete,
  requestClimbEdit,
  requestClimbMerge,
  requestClimbMove,
} from "@/actions";
import { createDb } from "@/db/client";
import { searchAreas, searchClimbs } from "@/db/queries";
import {
  adminAreaScopes,
  areas,
  changeRequestApprovals,
  changeRequests,
  climbs,
  user,
} from "@/db/schema";
import { sendChangeRequestDecisionEmail } from "@/lib/email";
import type { ChangeRequestType } from "@/lib/moderation";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

/** requestAreaEdit/requestAreaDelete/requestClimbEdit/requestClimbDelete are
 * the only path to a full edit (name/discipline/grade) or a delete —
 * updateArea/updateClimb only ever touch description, unrestricted, and
 * there's no direct delete at all (see actions/areas.ts, actions/climbs.ts).
 * These apply immediately for an admin covering every involved area and
 * queue a changeRequests row for everyone else. */

const sessionState = vi.hoisted(() => ({
  userId: "moderation-user" as string | null,
  role: null as string | null,
}));

vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
}));

// Stub the decision email so it can be asserted on directly instead of a
// real Resend call swallowed by notifyRequester's try/catch (which also
// reaches for getCloudflareContext outside a request — see
// lib/welcome-email.test.ts for the same rationale).
vi.mock("@/lib/email", () => ({
  sendChangeRequestDecisionEmail: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("@/lib/session", async () => {
  const { NotAdminError, NotSignedInError } = await import("@/lib/action-result");
  const isAdmin = (session: { user: { role?: string | null } }) => session.user.role === "admin";
  return {
    getSession: async () =>
      sessionState.userId ? { user: { id: sessionState.userId, role: sessionState.role } } : null,
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId, role: sessionState.role } };
    },
    requireAdmin: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      const session = { user: { id: sessionState.userId, role: sessionState.role } };
      if (!isAdmin(session)) throw new NotAdminError();
      return session;
    },
    isAdmin,
  };
});

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => actual.createDb(env.DB),
  };
});

const db = createDb(env.DB);

async function actAsAdmin() {
  if (!sessionState.userId) throw new Error("Expected a signed-in fixture user");
  sessionState.role = "admin";
  await db.update(user).set({ role: "admin" }).where(eq(user.id, sessionState.userId));
}

function areaFormData(name: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

function climbFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    name: "Renamed Climb",
    type: "boulder",
    grade: "5",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function requestsFor(type: ChangeRequestType, entityId: number) {
  return db
    .select()
    .from(changeRequests)
    .where(and(eq(changeRequests.type, type), eq(changeRequests.entityId, entityId)));
}

async function approvalsFor(requestId: number) {
  return db
    .select()
    .from(changeRequestApprovals)
    .where(eq(changeRequestApprovals.requestId, requestId));
}

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "moderation-user" });
  // Admin bypass is area-scoped (see lib/moderation.ts's isAdminForArea) — a
  // grant on the fixture tree's root covers every area/climb under it. Only
  // takes effect in the tests below that promote the user with actAsAdmin().
  await db.insert(adminAreaScopes).values({ userId: "moderation-user", areaId: 1 });

  // Coverage recomputes each approver's role and scopes from the DB (not
  // the session), so reviewers need real role: "admin" rows.
  await seedFixtureUser(db, { id: "reviewer-root", role: "admin" });
  await seedFixtureUser(db, { id: "review-requester" });
  await db.insert(adminAreaScopes).values({ userId: "reviewer-root", areaId: 1 });
});

beforeEach(() => {
  sessionState.userId = "moderation-user";
  sessionState.role = null;
  vi.mocked(sendChangeRequestDecisionEmail).mockClear();
});

// Fixture tree: Test Crag (1) > Test Boulders (2) > {Test Highball Alcove (4),
// Test Slab Area (5)}, and Test Crag (1) > Test Sport Wall (3).
describe("requestAreaEdit", () => {
  it("queues the delta instead of mutating for a non-admin", async () => {
    const result = await requestAreaEdit(3, areaFormData("Not Yet Renamed"));
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect((await db.select().from(areas).where(eq(areas.id, 3)).get())?.name).toBe(
      "Test Sport Wall",
    );
    const requests = await requestsFor("area_edit", 3);
    expect(requests).toHaveLength(1);
    expect(requests[0].requestedBy).toBe("moderation-user");
    // Only the changed field — the (unchanged, null) description isn't in
    // the payload, so approving later can't clobber a newer description.
    expect(JSON.parse(requests[0].payload)).toEqual({ name: "Not Yet Renamed" });
    // A non-admin requester contributes no approval coverage.
    expect(await approvalsFor(requests[0].id)).toHaveLength(0);
  });

  it("rejects a no-op edit without queuing anything", async () => {
    expect(await requestAreaEdit(4, areaFormData("Test Highball Alcove"))).toEqual({
      ok: false,
      error: "No changes to submit",
    });
    expect(await requestsFor("area_edit", 4)).toHaveLength(0);
  });

  it("rejects a duplicate pending request from the same requester", async () => {
    expect(await requestAreaEdit(3, areaFormData("First Rename"))).toEqual({
      ok: true,
      value: { status: "pending" },
    });
    expect(await requestAreaEdit(3, areaFormData("Renamed Differently"))).toEqual({
      ok: false,
      error: "You already have a pending request for this — an admin will review it",
    });
    expect(await requestsFor("area_edit", 3)).toHaveLength(1);
  });

  it("applies immediately for an admin and records the apply as an audit row", async () => {
    await actAsAdmin();
    // Area 2 is "Test Boulders".
    expect((await searchAreas(db, "Boulders")).areas.map((a) => a.id)).toEqual([2]);

    const result = await requestAreaEdit(2, areaFormData("Granite Garden"));
    expect(result).toEqual({ ok: true, value: { status: "applied" } });

    expect((await searchAreas(db, "Granite Garden")).areas.map((a) => a.id)).toEqual([2]);
    expect((await searchAreas(db, "Boulders")).areas).toEqual([]);

    // The bypass leaves a pre-decided changeRequests row — the audit trail
    // for direct admin applies.
    const requests = await requestsFor("area_edit", 2);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("approved");
    expect(requests[0].requestedBy).toBe("moderation-user");
    expect(requests[0].reviewedBy).toBe("moderation-user");
    expect(JSON.parse(requests[0].payload)).toEqual({ name: "Granite Garden" });
  });
});

describe("requestAreaDelete", () => {
  it("rejects immediately, without queuing, when the area isn't deletable", async () => {
    // Area 1 (Test Crag) has sub-areas.
    expect(await requestAreaDelete(1)).toEqual({
      ok: false,
      error: "Can't delete an area with sub-areas",
    });
    expect(await requestsFor("area_delete", 1)).toHaveLength(0);
  });

  it("queues a deletable area's removal for a non-admin", async () => {
    await db.insert(areas).values({ id: 101, parentId: 2, name: "Empty Leaf" });

    const result = await requestAreaDelete(101);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect(await db.select().from(areas).where(eq(areas.id, 101)).get()).toBeDefined();
    const requests = await requestsFor("area_delete", 101);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("pending");
    expect(JSON.parse(requests[0].payload)).toEqual({});
  });

  it("applies immediately for an admin, leaving an audit row", async () => {
    await actAsAdmin();
    await db.insert(areas).values({ id: 102, parentId: 2, name: "Ephemeral Cove" });
    expect((await searchAreas(db, "Ephemeral Cove")).areas).toHaveLength(1);

    expect(await requestAreaDelete(102)).toEqual({ ok: true, value: { status: "applied" } });

    expect(await db.select().from(areas).where(eq(areas.id, 102)).get()).toBeUndefined();
    expect((await searchAreas(db, "Ephemeral Cove")).areas).toEqual([]);
    const requests = await requestsFor("area_delete", 102);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("approved");
  });
});

describe("requestClimbEdit", () => {
  it("queues the delta instead of mutating for a non-admin", async () => {
    // Climb 3 is "Test Crimper", sport, grade 10 — match everything but the
    // name so the delta is exactly the rename.
    const result = await requestClimbEdit(
      3,
      climbFormData({ name: "Not Yet Renamed", type: "sport", grade: "10" }),
    );
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect((await db.select().from(climbs).where(eq(climbs.id, 3)).get())?.name).toBe(
      "Test Crimper",
    );
    const requests = await requestsFor("climb_edit", 3);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].payload)).toEqual({ name: "Not Yet Renamed" });
  });

  it("applies immediately for an admin and keeps the search index in sync", async () => {
    await actAsAdmin();
    expect(
      (await searchClimbs(db, { name: "Crimper", disciplines: [] })).climbs.map((c) => c.id),
    ).toEqual([3]);

    const result = await requestClimbEdit(
      3,
      climbFormData({ name: "Dyno Dance", type: "sport", grade: "10" }),
    );
    expect(result).toEqual({ ok: true, value: { status: "applied" } });

    expect(
      (await searchClimbs(db, { name: "Dyno Dance", disciplines: [] })).climbs.map((c) => c.id),
    ).toEqual([3]);
    expect((await searchClimbs(db, { name: "Crimper", disciplines: [] })).climbs).toEqual([]);
  });

  it("rejects a discipline change once sends have been logged, even for an admin", async () => {
    await actAsAdmin();
    await seedFixtureSend(db, { userId: "moderation-user", climbId: 1, dateSent: "2026-01-01" });

    const result = await requestClimbEdit(
      1,
      climbFormData({ name: "Test Highball", type: "sport" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Can't change discipline once a climb has logged sends",
    });
  });
});

describe("requestClimbDelete", () => {
  it("rejects immediately, without queuing, when the climb has logged sends", async () => {
    await seedFixtureSend(db, { userId: "moderation-user", climbId: 1, dateSent: "2026-01-01" });
    expect(await requestClimbDelete(1)).toEqual({
      ok: false,
      error: "Can't delete a climb with logged sends",
    });
    expect(await requestsFor("climb_delete", 1)).toHaveLength(0);
  });

  it("queues a deletable climb's removal for a non-admin", async () => {
    const result = await requestClimbDelete(2);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect(await db.select().from(climbs).where(eq(climbs.id, 2)).get()).toBeDefined();
    const requests = await requestsFor("climb_delete", 2);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("pending");
  });

  it("applies immediately for an admin, leaving an audit row", async () => {
    await actAsAdmin();
    await db
      .insert(climbs)
      .values({ id: 200, areaId: 3, name: "Ephemeral Problem", type: "boulder", grade: 3 });
    expect(
      (await searchClimbs(db, { name: "Ephemeral Problem", disciplines: [] })).climbs,
    ).toHaveLength(1);

    expect(await requestClimbDelete(200)).toEqual({ ok: true, value: { status: "applied" } });

    expect(await db.select().from(climbs).where(eq(climbs.id, 200)).get()).toBeUndefined();
    expect((await searchClimbs(db, { name: "Ephemeral Problem", disciplines: [] })).climbs).toEqual(
      [],
    );
    const requests = await requestsFor("climb_delete", 200);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("approved");
  });
});

describe("requestAreaReparent", () => {
  it("queues a change request instead of mutating for a non-admin", async () => {
    const result = await requestAreaReparent(5, 3);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect((await db.select().from(areas).where(eq(areas.id, 5)).get())?.parentId).toBe(2);
    const requests = await requestsFor("area_reparent", 5);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].payload)).toEqual({ newParentId: 3 });
  });

  it("rejects immediately, without queuing, when the move is illegal", async () => {
    // Area 4 (Test Highball Alcove) is a child of area 2 (Test Boulders) —
    // can't move area 2 under its own sub-area.
    expect(await requestAreaReparent(2, 4)).toEqual({
      ok: false,
      error: "Can't move an area under itself or one of its own sub-areas",
    });
    expect(await requestsFor("area_reparent", 2)).toHaveLength(0);
  });

  it("applies immediately for an admin covering both sides", async () => {
    await actAsAdmin();
    await db.insert(areas).values({ id: 300, parentId: 1, name: "Ephemeral Buttress" });
    await db.insert(areas).values({ id: 301, parentId: 3, name: "Ephemeral Ledge" });

    const result = await requestAreaReparent(300, 301);
    expect(result).toEqual({ ok: true, value: { status: "applied" } });

    expect((await db.select().from(areas).where(eq(areas.id, 300)).get())?.parentId).toBe(301);
  });

  it("queues rather than bypassing when the admin manages only one side, recording their approval", async () => {
    await db.insert(areas).values([
      { id: 600, parentId: null, name: "Dual Source Area" },
      { id: 601, parentId: null, name: "Dual Destination Area" },
    ]);
    await seedFixtureUser(db, { id: "half-scope-admin", role: "admin" });
    await db.insert(adminAreaScopes).values({ userId: "half-scope-admin", areaId: 600 });

    sessionState.userId = "half-scope-admin";
    await actAsAdmin();

    const result = await requestAreaReparent(600, 601);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });
    expect((await db.select().from(areas).where(eq(areas.id, 600)).get())?.parentId).toBeNull();

    // Their submission doubles as their approval for the side they manage —
    // only the destination still needs an independent admin.
    const [request] = await requestsFor("area_reparent", 600);
    const approvals = await approvalsFor(request.id);
    expect(approvals.map((a) => a.userId)).toEqual(["half-scope-admin"]);
  });

  it("applies immediately once the admin manages both sides", async () => {
    await db.insert(areas).values([
      { id: 610, parentId: null, name: "Dual Source Area 2" },
      { id: 611, parentId: null, name: "Dual Destination Area 2" },
    ]);
    await seedFixtureUser(db, { id: "full-scope-admin" });
    await db.insert(adminAreaScopes).values([
      { userId: "full-scope-admin", areaId: 610 },
      { userId: "full-scope-admin", areaId: 611 },
    ]);

    sessionState.userId = "full-scope-admin";
    await actAsAdmin();

    const result = await requestAreaReparent(610, 611);
    expect(result).toEqual({ ok: true, value: { status: "applied" } });
    expect((await db.select().from(areas).where(eq(areas.id, 610)).get())?.parentId).toBe(611);
  });
});

describe("requestClimbMove", () => {
  it("queues a change request instead of mutating for a non-admin", async () => {
    const result = await requestClimbMove(4, 5);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect((await db.select().from(climbs).where(eq(climbs.id, 4)).get())?.areaId).toBe(3);
    const requests = await requestsFor("climb_move", 4);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].payload)).toEqual({ newAreaId: 5 });
  });

  it("rejects immediately, without queuing, for an unknown destination area", async () => {
    await db
      .insert(climbs)
      .values({ id: 401, areaId: 3, name: "Ephemeral Arete", type: "boulder", grade: 3 });

    expect(await requestClimbMove(401, 999999)).toEqual({ ok: false, error: "Area not found" });
    expect(await requestsFor("climb_move", 401)).toHaveLength(0);
  });

  it("applies immediately for an admin covering both sides", async () => {
    await actAsAdmin();
    await db
      .insert(climbs)
      .values({ id: 400, areaId: 3, name: "Ephemeral Traverse", type: "boulder", grade: 3 });

    const result = await requestClimbMove(400, 5);
    expect(result).toEqual({ ok: true, value: { status: "applied" } });

    expect((await db.select().from(climbs).where(eq(climbs.id, 400)).get())?.areaId).toBe(5);
  });

  it("queues rather than bypassing when the admin manages only the climb's current area", async () => {
    await db.insert(areas).values({ id: 630, parentId: null, name: "Dual Climb Destination" });
    await db
      .insert(climbs)
      .values({ id: 631, areaId: 3, name: "Dual Climb Source", type: "boulder", grade: 3 });
    await seedFixtureUser(db, { id: "climb-half-scope-admin" });
    // Managed area 3 — where the climb currently lives, not area 630.
    await db.insert(adminAreaScopes).values({ userId: "climb-half-scope-admin", areaId: 3 });

    sessionState.userId = "climb-half-scope-admin";
    await actAsAdmin();

    const result = await requestClimbMove(631, 630);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });
    expect((await db.select().from(climbs).where(eq(climbs.id, 631)).get())?.areaId).toBe(3);
  });
});

describe("requestClimbMerge", () => {
  it("queues a change request instead of merging for a non-admin", async () => {
    await db.insert(climbs).values([
      { id: 950, areaId: 3, name: "Action Merge Source", type: "boulder", grade: 3 },
      { id: 951, areaId: 3, name: "Action Merge Target", type: "boulder", grade: 3 },
    ]);

    const result = await requestClimbMerge(950, 951);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    expect(await db.select().from(climbs).where(eq(climbs.id, 950)).get()).toBeDefined();
    const requests = await requestsFor("climb_merge", 950);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0].payload)).toEqual({ targetClimbId: 951, overrides: {} });
  });

  it("stores only whitelisted, validated override fields", async () => {
    await db.insert(climbs).values([
      { id: 956, areaId: 3, name: "Smuggle Source", type: "boulder", grade: 3 },
      { id: 957, areaId: 3, name: "Smuggle Target", type: "boulder", grade: 3 },
    ]);

    // A crafted call trying to rewrite columns a merge must never touch —
    // Server Action arguments are client-shaped regardless of their type.
    const result = await requestClimbMerge(956, 957, {
      name: "Innocent Rename",
      areaId: 999999,
      sendCount: 9999,
      type: "sport",
      grade: 4,
    });
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    const [request] = await requestsFor("climb_merge", 956);
    expect(JSON.parse(request.payload)).toEqual({
      targetClimbId: 957,
      overrides: { name: "Innocent Rename", grade: 4 },
    });
  });

  it("rejects an out-of-scale override grade without queuing", async () => {
    await db.insert(climbs).values([
      { id: 958, areaId: 3, name: "Bad Grade Source", type: "boulder", grade: 3 },
      { id: 959, areaId: 3, name: "Bad Grade Target", type: "boulder", grade: 3 },
    ]);

    expect(await requestClimbMerge(958, 959, { grade: 999 })).toEqual({
      ok: false,
      error: "Invalid grade",
    });
    expect(await requestsFor("climb_merge", 958)).toHaveLength(0);
  });

  it("applies immediately for an admin covering both areas, leaving an audit row", async () => {
    await actAsAdmin();
    await db.insert(climbs).values([
      { id: 952, areaId: 3, name: "Action Merge Source 2", type: "boulder", grade: 3 },
      { id: 953, areaId: 4, name: "Action Merge Target 2", type: "boulder", grade: 3 },
    ]);

    const result = await requestClimbMerge(952, 953);
    expect(result).toEqual({ ok: true, value: { status: "applied" } });

    expect(await db.select().from(climbs).where(eq(climbs.id, 952)).get()).toBeUndefined();
    const requests = await requestsFor("climb_merge", 952);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("approved");
  });

  it("queues rather than bypassing when the admin manages only the source's area", async () => {
    // The target lives in a brand-new root area the admin doesn't manage —
    // a merge rewrites the target (sends, overrides), so managing only the
    // disappearing side isn't enough to bypass review.
    await db.insert(areas).values({ id: 640, parentId: null, name: "Unmanaged Merge Continent" });
    await db.insert(climbs).values([
      { id: 960, areaId: 3, name: "Cross Merge Source", type: "boulder", grade: 3 },
      { id: 961, areaId: 640, name: "Cross Merge Target", type: "boulder", grade: 3 },
    ]);
    await seedFixtureUser(db, { id: "merge-half-scope-admin", role: "admin" });
    await db.insert(adminAreaScopes).values({ userId: "merge-half-scope-admin", areaId: 3 });

    sessionState.userId = "merge-half-scope-admin";
    await actAsAdmin();

    const result = await requestClimbMerge(960, 961, { name: "Hostile Takeover" });
    expect(result).toEqual({ ok: true, value: { status: "pending" } });

    // Nothing merged, nothing renamed.
    expect(await db.select().from(climbs).where(eq(climbs.id, 960)).get()).toBeDefined();
    expect((await db.select().from(climbs).where(eq(climbs.id, 961)).get())?.name).toBe(
      "Cross Merge Target",
    );
    // Their approval covers the source side only; the target side still
    // needs an admin of its own.
    const [request] = await requestsFor("climb_merge", 960);
    expect((await approvalsFor(request.id)).map((a) => a.userId)).toEqual([
      "merge-half-scope-admin",
    ]);
  });

  it("rejects a discipline mismatch immediately, without queuing", async () => {
    await db.insert(climbs).values([
      { id: 954, areaId: 3, name: "Action Merge Boulder", type: "boulder", grade: 3 },
      { id: 955, areaId: 3, name: "Action Merge Sport", type: "sport", grade: 8 },
    ]);

    const result = await requestClimbMerge(954, 955);
    expect(result).toEqual({
      ok: false,
      error: "Can't mark a climb as a duplicate of a different discipline",
    });
    expect(await requestsFor("climb_merge", 954)).toHaveLength(0);
  });
});

describe("approveChangeRequest", () => {
  it("applies a fully-covered request and marks it approved", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_edit",
        entityId: 3,
        payload: JSON.stringify({ name: "Approved Rename" }),
        requestedBy: "review-requester",
      })
      .returning({ id: changeRequests.id });

    expect(await approveChangeRequest(requestId)).toEqual({
      ok: true,
      value: { decision: "applied" },
    });

    expect((await db.select().from(areas).where(eq(areas.id, 3)).get())?.name).toBe(
      "Approved Rename",
    );
    const row = (await db.select().from(changeRequests).where(eq(changeRequests.id, requestId))).at(
      0,
    )!;
    expect(row.status).toBe("approved");
    expect(row.reviewedBy).toBe("reviewer-root");
    expect(row.reviewedAt).toBeInstanceOf(Date);
    expect(sendChangeRequestDecisionEmail).toHaveBeenCalledExactlyOnceWith(
      "review-requester@example.com",
      expect.objectContaining({ decision: "approved", note: null }),
    );
  });

  it("accumulates approvals across admins until every area is covered", async () => {
    await db.insert(areas).values([
      { id: 700, parentId: null, name: "Coverage Source Root" },
      { id: 701, parentId: null, name: "Coverage Destination Root" },
      { id: 702, parentId: 700, name: "Coverage Moving Area" },
    ]);
    await seedFixtureUser(db, { id: "coverage-approver-a", role: "admin" });
    await seedFixtureUser(db, { id: "coverage-approver-b", role: "admin" });
    await db.insert(adminAreaScopes).values([
      { userId: "coverage-approver-a", areaId: 700 },
      { userId: "coverage-approver-b", areaId: 701 },
    ]);

    // A plain user asks to move area 702 (under root 700) beneath root 701.
    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_reparent",
        entityId: 702,
        payload: JSON.stringify({ newParentId: 701 }),
        requestedBy: "moderation-user",
      })
      .returning({ id: changeRequests.id });

    sessionState.userId = "coverage-approver-a";
    await actAsAdmin();
    expect(await approveChangeRequest(requestId)).toEqual({
      ok: true,
      value: { decision: "awaiting" },
    });
    // Half-covered: still pending, nothing moved.
    expect(
      (await db.select().from(changeRequests).where(eq(changeRequests.id, requestId)).get())
        ?.status,
    ).toBe("pending");
    expect((await db.select().from(areas).where(eq(areas.id, 702)).get())?.parentId).toBe(700);
    // No decision yet — no email.
    expect(sendChangeRequestDecisionEmail).not.toHaveBeenCalled();

    sessionState.userId = "coverage-approver-b";
    expect(await approveChangeRequest(requestId)).toEqual({
      ok: true,
      value: { decision: "applied" },
    });
    expect((await db.select().from(areas).where(eq(areas.id, 702)).get())?.parentId).toBe(701);
    const row = await db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.id, requestId))
      .get();
    expect(row?.status).toBe("approved");
    expect(row?.reviewedBy).toBe("coverage-approver-b");
    expect(sendChangeRequestDecisionEmail).toHaveBeenCalledExactlyOnceWith(
      "moderation-user@example.com",
      expect.objectContaining({ decision: "approved" }),
    );
  });

  it("blocks reviewing your own request", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_edit",
        entityId: 3,
        payload: JSON.stringify({ name: "Self Serve" }),
        requestedBy: "reviewer-root",
      })
      .returning({ id: changeRequests.id });

    expect(await approveChangeRequest(requestId)).toEqual({
      ok: false,
      error: "You can't review your own request",
    });
  });

  it("returns Admins only for a signed-in non-admin", async () => {
    sessionState.userId = "moderation-user";
    sessionState.role = null;

    expect(await approveChangeRequest(1)).toEqual({ ok: false, error: "Admins only." });
  });

  it("rejects reviewing an unknown request", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();
    expect(await approveChangeRequest(999999)).toEqual({ ok: false, error: "Request not found" });
  });

  it("rejects reviewing an already-decided request", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_edit",
        entityId: 3,
        payload: JSON.stringify({ name: "Whatever" }),
        requestedBy: "moderation-user",
        status: "approved",
      })
      .returning({ id: changeRequests.id });

    expect(await approveChangeRequest(requestId)).toEqual({
      ok: false,
      error: "This request has already been reviewed",
    });
  });

  it("rejects a request outside the admin's managed areas", async () => {
    await db.insert(areas).values({ id: 500, parentId: null, name: "Unmanaged Continent" });
    await seedFixtureUser(db, { id: "elsewhere-admin", role: "admin" });
    await db.insert(adminAreaScopes).values({ userId: "elsewhere-admin", areaId: 500 });

    sessionState.userId = "elsewhere-admin";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_edit",
        entityId: 3,
        payload: JSON.stringify({ name: "Whatever" }),
        requestedBy: "review-requester",
      })
      .returning({ id: changeRequests.id });

    expect(await approveChangeRequest(requestId)).toEqual({
      ok: false,
      error: "You don't manage this area",
    });
  });

  it("blocks both approval and rejection when the affected entity is gone", async () => {
    await db
      .insert(climbs)
      .values({ id: 970, areaId: 3, name: "Soon Gone", type: "boulder", grade: 3 });
    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "climb_edit",
        entityId: 970,
        payload: JSON.stringify({ name: "Too Late" }),
        requestedBy: "moderation-user",
      })
      .returning({ id: changeRequests.id });
    await db.delete(climbs).where(eq(climbs.id, 970));

    await seedFixtureUser(db, { id: "elsewhere-admin", role: "admin" });
    // The entity vanished via a raw DB delete (not applyClimbDelete, which
    // would have auto-rejected this request) — nobody can review the
    // leftover either way.
    sessionState.userId = "elsewhere-admin";
    await actAsAdmin();
    expect(await approveChangeRequest(requestId)).toEqual({
      ok: false,
      error: "The area or climb this request affects is gone",
    });
    expect(await rejectChangeRequest(requestId, "target vanished")).toEqual({
      ok: false,
      error: "The area or climb this request affects is gone",
    });
  });

  it("puts the request back to pending when the apply fails a business rule", async () => {
    await db
      .insert(climbs)
      .values({ id: 971, areaId: 3, name: "Delete Race", type: "boulder", grade: 3 });
    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "climb_delete",
        entityId: 971,
        payload: "{}",
        requestedBy: "moderation-user",
      })
      .returning({ id: changeRequests.id });
    // A send lands between queue time and review time.
    await seedFixtureUser(db, { id: "race-sender" });
    await seedFixtureSend(db, { userId: "race-sender", climbId: 971, dateSent: "2026-02-01" });

    sessionState.userId = "reviewer-root";
    await actAsAdmin();
    expect(await approveChangeRequest(requestId)).toEqual({
      ok: false,
      error: "Can't delete a climb with logged sends",
    });

    const row = await db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.id, requestId))
      .get();
    expect(row?.status).toBe("pending");
    expect(row?.reviewedBy).toBeNull();
    expect(await db.select().from(climbs).where(eq(climbs.id, 971)).get()).toBeDefined();
  });
});

describe("rejectChangeRequest", () => {
  it("marks the request rejected with a note, without mutating anything", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "climb_delete",
        entityId: 2,
        payload: "{}",
        requestedBy: "review-requester",
      })
      .returning({ id: changeRequests.id });

    expect(await rejectChangeRequest(requestId, "Not a duplicate after all")).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await db.select().from(climbs).where(eq(climbs.id, 2)).get()).toBeDefined();
    const row = (await db.select().from(changeRequests).where(eq(changeRequests.id, requestId))).at(
      0,
    )!;
    expect(row.status).toBe("rejected");
    expect(row.reviewNote).toBe("Not a duplicate after all");
    expect(row.reviewedBy).toBe("reviewer-root");
    expect(sendChangeRequestDecisionEmail).toHaveBeenCalledExactlyOnceWith(
      "review-requester@example.com",
      expect.objectContaining({ decision: "rejected", note: "Not a duplicate after all" }),
    );
  });

  it("blocks rejecting your own request too — reviews come from someone else", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_edit",
        entityId: 4,
        payload: JSON.stringify({ name: "Changed My Mind" }),
        requestedBy: "reviewer-root",
      })
      .returning({ id: changeRequests.id });

    expect(await rejectChangeRequest(requestId, "")).toEqual({
      ok: false,
      error: "You can't review your own request",
    });
    expect(
      (await db.select().from(changeRequests).where(eq(changeRequests.id, requestId)).get())
        ?.status,
    ).toBe("pending");
    // Never decided, so nobody hears about it.
    expect(sendChangeRequestDecisionEmail).not.toHaveBeenCalled();
  });

  it("refuses a second decision on the same request", async () => {
    sessionState.userId = "reviewer-root";
    await actAsAdmin();

    const [{ id: requestId }] = await db
      .insert(changeRequests)
      .values({
        type: "area_edit",
        entityId: 5,
        payload: JSON.stringify({ name: "Once Only" }),
        requestedBy: "review-requester",
      })
      .returning({ id: changeRequests.id });

    expect(await rejectChangeRequest(requestId, "first")).toEqual({ ok: true, value: undefined });
    expect(await rejectChangeRequest(requestId, "second")).toEqual({
      ok: false,
      error: "This request has already been reviewed",
    });
    expect(await approveChangeRequest(requestId)).toEqual({
      ok: false,
      error: "This request has already been reviewed",
    });
  });
});
