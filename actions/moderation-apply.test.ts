import { env } from "cloudflare:test";
import { eq, and } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordChangeRequestApproval,
  submitChangeRequest,
  applyAreaEdit,
  assertAreaDeletable,
  applyAreaDelete,
  assertAreaReparentable,
  applyAreaReparent,
  assertClimbMovable,
  applyClimbMove,
  applyClimbEdit,
  assertClimbDeletable,
  applyClimbDelete,
  assertClimbMergeable,
  applyClimbMerge,
} from "@/actions/moderation-apply";
import { createDb, type Database } from "@/db/client";
import { getChangeRequest, getJournalForClimb } from "@/db/queries";
import { adminAreaScopes, areas, changeRequests, climbs, journalEntries, sends } from "@/db/schema";
import { formatGrade } from "@/lib/grades";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

import {
  changedFields,
  changeRequestCoverage,
  changeRequestScopeAreaIds,
  describeChangeRequest,
  getReviewQueueDetails,
  isAdminForAllAreas,
  isAdminForAnyArea,
  isAdminForArea,
} from "@/lib/moderation";

let db: Database;

async function loadRequest(id: number) {
  const request = await getChangeRequest(db, id);
  if (!request) throw new Error(`request ${id} not found`);
  return request;
}

/** Coverage the way real callers invoke it — with the scope ids they
 * already derived. */
async function coverageFor(request: Awaited<ReturnType<typeof loadRequest>>) {
  return changeRequestCoverage(db, request, await changeRequestScopeAreaIds(db, request));
}

beforeEach(async () => {
  db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "moderation-requester" });
});

describe("changedFields", () => {
  it("keeps only the keys whose values differ", () => {
    expect(
      changedFields(
        { name: "Old", type: "boulder", grade: 3, description: null },
        { name: "Old", type: "boulder", grade: 5, description: "New" },
      ),
    ).toEqual({ grade: 5, description: "New" });
  });

  it("is empty when nothing differs", () => {
    expect(changedFields({ name: "Same" }, { name: "Same" })).toEqual({});
  });
});

describe("submitChangeRequest", () => {
  it("stores the payload as JSON on a pending row and returns its id", async () => {
    const id = await submitChangeRequest(db, "area_edit", 1, "moderation-requester", {
      name: "Renamed Crag",
    });

    const row = await db.select().from(changeRequests).where(eq(changeRequests.id, id)).get();
    expect(row?.type).toBe("area_edit");
    expect(row?.entityId).toBe(1);
    expect(row?.requestedBy).toBe("moderation-requester");
    expect(row?.status).toBe("pending");
    expect(row?.reviewedBy).toBeNull();
    expect(JSON.parse(row?.payload ?? "")).toEqual({ name: "Renamed Crag" });
  });

  it("rejects a duplicate pending request for the same entity and requester", async () => {
    await submitChangeRequest(db, "area_edit", 1, "moderation-requester", { name: "First" });
    await expect(
      submitChangeRequest(db, "area_edit", 1, "moderation-requester", { name: "Again" }),
    ).rejects.toThrow("You already have a pending request for this");
  });

  it("allows the same request from a different requester", async () => {
    await submitChangeRequest(db, "area_edit", 1, "moderation-requester", { name: "First" });
    await seedFixtureUser(db, { id: "second-requester" });
    await expect(
      submitChangeRequest(db, "area_edit", 1, "second-requester", { name: "Renamed Crag" }),
    ).resolves.toBeGreaterThan(0);
  });

  it("allows a re-submit once the earlier request is decided", async () => {
    await seedFixtureUser(db, { id: "resubmit-requester" });
    const first = await submitChangeRequest(db, "area_edit", 2, "resubmit-requester", {
      name: "First Try",
    });
    await db.update(changeRequests).set({ status: "rejected" }).where(eq(changeRequests.id, first));

    await expect(
      submitChangeRequest(db, "area_edit", 2, "resubmit-requester", { name: "Second Try" }),
    ).resolves.toBeGreaterThan(first);
  });

  it("gives each request its own id", async () => {
    const first = await submitChangeRequest(db, "climb_delete", 1, "moderation-requester", {});
    const second = await submitChangeRequest(db, "climb_delete", 2, "moderation-requester", {});
    expect(first).not.toBe(second);
  });
});

// Fixture tree: Test Crag (1) > Test Boulders (2) > {Test Highball Alcove (4),
// Test Slab Area (5)}, and Test Crag (1) > Test Sport Wall (3).
describe("isAdminForArea", () => {
  beforeEach(async () => {
    await seedFixtureUser(db, { id: "scope-admin" });
    await seedFixtureUser(db, { id: "roleless-scope-admin" });
    await db.insert(adminAreaScopes).values({ userId: "scope-admin", areaId: 2 });
  });

  it("is false for a non-admin role, even with a managed area", async () => {
    expect(await isAdminForArea(db, { user: { id: "scope-admin", role: null } }, 4)).toBe(false);
  });

  it("is false for an admin with no managed areas at all", async () => {
    expect(
      await isAdminForArea(db, { user: { id: "roleless-scope-admin", role: "admin" } }, 4),
    ).toBe(false);
  });

  it("is true for the managed area itself", async () => {
    expect(await isAdminForArea(db, { user: { id: "scope-admin", role: "admin" } }, 2)).toBe(true);
  });

  it("is true for a descendant of the managed area", async () => {
    // Area 4 (Test Highball Alcove) is under area 2 (Test Boulders).
    expect(await isAdminForArea(db, { user: { id: "scope-admin", role: "admin" } }, 4)).toBe(true);
  });

  it("is false outside the managed area's subtree", async () => {
    // Area 3 (Test Sport Wall) is a sibling of area 2, not under it.
    expect(await isAdminForArea(db, { user: { id: "scope-admin", role: "admin" } }, 3)).toBe(false);
  });
});

describe("changeRequestScopeAreaIds", () => {
  beforeEach(async () => {
    await seedFixtureUser(db, { id: "scope-requester" });
  });

  it("resolves an area_edit/area_delete request to the area itself", async () => {
    const id = await submitChangeRequest(db, "area_edit", 2, "scope-requester", {
      name: "Renamed",
    });
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([2]);
  });

  it("resolves an area_reparent request to both the area and its destination", async () => {
    const id = await submitChangeRequest(db, "area_reparent", 3, "scope-requester", {
      newParentId: 5,
    });
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([3, 5]);
  });

  it("resolves a climb_edit/climb_delete request to the climb's current area", async () => {
    // Climb 1 (Test Highball) lives in area 4.
    const id = await submitChangeRequest(db, "climb_delete", 1, "scope-requester", {});
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([4]);
  });

  it("resolves a climb_move request to both the current and destination area", async () => {
    // Climb 1 (Test Highball) lives in area 4.
    const id = await submitChangeRequest(db, "climb_move", 1, "scope-requester", {
      newAreaId: 3,
    });
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([4, 3]);
  });

  it("resolves a climb_merge request to both the source and target climb's areas", async () => {
    // Climb 1 lives in area 4; a same-discipline merge partner in area 3.
    await db
      .insert(climbs)
      .values({ id: 890, areaId: 3, name: "Scope Merge Target", type: "boulder", grade: 3 });
    const id = await submitChangeRequest(db, "climb_merge", 1, "scope-requester", {
      targetClimbId: 890,
    });
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([4, 3]);
  });

  it("returns [] when the underlying entity is gone", async () => {
    const id = await submitChangeRequest(db, "climb_delete", 999999, "scope-requester", {});
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([]);
  });

  it("returns [] when a move's destination area is gone", async () => {
    const id = await submitChangeRequest(db, "climb_move", 2, "scope-requester", {
      newAreaId: 999999,
    });
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([]);
  });

  it("returns [] when a merge's target climb is gone", async () => {
    const id = await submitChangeRequest(db, "climb_merge", 2, "scope-requester", {
      targetClimbId: 999999,
    });
    expect(await changeRequestScopeAreaIds(db, await loadRequest(id))).toEqual([]);
  });
});

describe("isAdminForAnyArea", () => {
  it("is true when only one of several areas is managed", async () => {
    await seedFixtureUser(db, { id: "any-area-admin" });
    await db.insert(adminAreaScopes).values({ userId: "any-area-admin", areaId: 2 });

    expect(
      await isAdminForAnyArea(db, { user: { id: "any-area-admin", role: "admin" } }, [3, 4]),
    ).toBe(true); // area 4 is under managed area 2
  });

  it("is false when none of the areas are managed", async () => {
    await seedFixtureUser(db, { id: "unrelated-admin" });
    await db.insert(adminAreaScopes).values({ userId: "unrelated-admin", areaId: 3 });

    expect(
      await isAdminForAnyArea(db, { user: { id: "unrelated-admin", role: "admin" } }, [2, 4]),
    ).toBe(false);
  });
});

describe("isAdminForAllAreas", () => {
  it("is true only when every area is managed", async () => {
    await seedFixtureUser(db, { id: "all-area-admin" });
    await db.insert(adminAreaScopes).values({ userId: "all-area-admin", areaId: 1 }); // root, covers everything

    expect(
      await isAdminForAllAreas(db, { user: { id: "all-area-admin", role: "admin" } }, [2, 3]),
    ).toBe(true);
  });

  it("is false when only one of two areas is managed", async () => {
    await seedFixtureUser(db, { id: "half-area-admin" });
    await db.insert(adminAreaScopes).values({ userId: "half-area-admin", areaId: 2 });

    expect(
      await isAdminForAllAreas(db, { user: { id: "half-area-admin", role: "admin" } }, [2, 3]),
    ).toBe(false);
  });

  it("is false for an empty area list", async () => {
    expect(
      await isAdminForAllAreas(db, { user: { id: "moderation-requester", role: "admin" } }, []),
    ).toBe(false);
  });
});

describe("changeRequestCoverage", () => {
  beforeEach(async () => {
    // Roles live on the user row here (not a session object) because
    // coverage re-reads each approver's current role at decision time.
    await seedFixtureUser(db, { id: "coverage-admin-a", role: "admin" });
    await seedFixtureUser(db, { id: "coverage-admin-b", role: "admin" });
    await seedFixtureUser(db, { id: "coverage-non-admin" });
    await seedFixtureUser(db, { id: "coverage-requester" });
    await db.insert(adminAreaScopes).values([
      { userId: "coverage-admin-a", areaId: 2 },
      { userId: "coverage-admin-b", areaId: 3 },
      { userId: "coverage-non-admin", areaId: 1 },
    ]);
  });

  it("accumulates approvals until every involved area is covered", async () => {
    // Climb 1 lives in area 4 (under 2); destination is area 3.
    const id = await submitChangeRequest(db, "climb_move", 1, "coverage-requester", {
      newAreaId: 3,
    });
    const request = await loadRequest(id);

    const before = await coverageFor(request);
    expect(before.scopeAreaIds).toEqual([4, 3]);
    expect(before.missingAreaIds).toEqual([4, 3]);
    expect(before.complete).toBe(false);

    await recordChangeRequestApproval(db, id, "coverage-admin-a");
    const half = await coverageFor(request);
    expect(half.missingAreaIds).toEqual([3]);
    expect(half.complete).toBe(false);

    await recordChangeRequestApproval(db, id, "coverage-admin-b");
    const full = await coverageFor(request);
    expect(full.missingAreaIds).toEqual([]);
    expect(full.complete).toBe(true);
  });

  it("is complete after one approval from an admin covering every side", async () => {
    await seedFixtureUser(db, { id: "coverage-root-admin", role: "admin" });
    await db.insert(adminAreaScopes).values({ userId: "coverage-root-admin", areaId: 1 });

    const id = await submitChangeRequest(db, "climb_move", 2, "coverage-requester", {
      newAreaId: 3,
    });
    await recordChangeRequestApproval(db, id, "coverage-root-admin");

    const coverage = await coverageFor(await loadRequest(id));
    expect(coverage.complete).toBe(true);
  });

  it("stops counting an approval when the approver's scope is revoked", async () => {
    await seedFixtureUser(db, { id: "coverage-revoked-admin", role: "admin" });
    await db.insert(adminAreaScopes).values({ userId: "coverage-revoked-admin", areaId: 4 });

    const id = await submitChangeRequest(db, "climb_edit", 1, "coverage-requester", {
      name: "Coverage Rename",
    });
    await recordChangeRequestApproval(db, id, "coverage-revoked-admin");
    expect((await coverageFor(await loadRequest(id))).complete).toBe(true);

    await db
      .delete(adminAreaScopes)
      .where(
        and(eq(adminAreaScopes.userId, "coverage-revoked-admin"), eq(adminAreaScopes.areaId, 4)),
      );
    expect((await coverageFor(await loadRequest(id))).complete).toBe(false);
  });

  it("ignores approvals from users without the admin role", async () => {
    const id = await submitChangeRequest(db, "area_edit", 4, "coverage-requester", {
      name: "Non-admin Coverage",
    });
    await recordChangeRequestApproval(db, id, "coverage-non-admin");

    const coverage = await coverageFor(await loadRequest(id));
    expect(coverage.approvers.map((a) => a.id)).toEqual(["coverage-non-admin"]);
    expect(coverage.complete).toBe(false);
  });

  it("is never complete for a request whose entity is gone", async () => {
    await seedFixtureUser(db, { id: "coverage-zombie-admin", role: "admin" });
    await db.insert(adminAreaScopes).values({ userId: "coverage-zombie-admin", areaId: 1 });

    const id = await submitChangeRequest(db, "climb_delete", 999998, "coverage-requester", {});
    await recordChangeRequestApproval(db, id, "coverage-zombie-admin");

    const coverage = await coverageFor(await loadRequest(id));
    expect(coverage.scopeAreaIds).toEqual([]);
    expect(coverage.complete).toBe(false);
  });

  it("records an approval idempotently", async () => {
    const id = await submitChangeRequest(db, "area_edit", 5, "coverage-requester", {
      name: "Idempotent",
    });
    await recordChangeRequestApproval(db, id, "coverage-admin-a");
    await recordChangeRequestApproval(db, id, "coverage-admin-a");

    const coverage = await coverageFor(await loadRequest(id));
    expect(coverage.approvers.map((a) => a.id)).toEqual(["coverage-admin-a"]);
  });
});

describe("getReviewQueueDetails", () => {
  it("only returns pending requests inside the admin's managed areas", async () => {
    await seedFixtureUser(db, { id: "visibility-admin" });
    await seedFixtureUser(db, { id: "visibility-requester" });
    // Area 2 (Test Boulders) and its subtree — climb 1 lives in area 4, under
    // area 2; area 3 (Test Sport Wall) is a sibling, out of scope.
    await db.insert(adminAreaScopes).values({ userId: "visibility-admin", areaId: 2 });

    const inScopeId = await submitChangeRequest(db, "climb_delete", 1, "visibility-requester", {});
    const outOfScopeId = await submitChangeRequest(
      db,
      "area_delete",
      3,
      "visibility-requester",
      {},
    );

    const queue = await getReviewQueueDetails(db, {
      user: { id: "visibility-admin", role: "admin" },
    });
    const visibleIds = queue.map((q) => q.request.id);
    expect(visibleIds).toContain(inScopeId);
    expect(visibleIds).not.toContain(outOfScopeId);
    // The derived scope rides along for downstream coverage checks.
    expect(queue.find((q) => q.request.id === inScopeId)?.coverage.scopeAreaIds).toEqual([4]);
  });

  it("omits the admin's own requests — they can't review them anyway", async () => {
    await seedFixtureUser(db, { id: "visibility-admin" });
    await db.insert(adminAreaScopes).values({ userId: "visibility-admin", areaId: 2 });
    const visibleId = await submitChangeRequest(db, "area_edit", 4, "moderation-requester", {
      name: "Visible",
    });
    const ownId = await submitChangeRequest(db, "area_edit", 5, "visibility-admin", {
      name: "My Own Rename",
    });

    const queue = await getReviewQueueDetails(db, {
      user: { id: "visibility-admin", role: "admin" },
    });
    expect(queue.map((q) => q.request.id)).toEqual([visibleId]);
    expect(visibleId).not.toBe(ownId);
  });

  it("shows a reparent request to an admin managing only the destination side", async () => {
    await seedFixtureUser(db, { id: "destination-only-admin" });
    await seedFixtureUser(db, { id: "destination-requester" });
    // Managed area 5 — the destination, not area 3 (the area being moved).
    await db.insert(adminAreaScopes).values({ userId: "destination-only-admin", areaId: 5 });

    const id = await submitChangeRequest(db, "area_reparent", 3, "destination-requester", {
      newParentId: 5,
    });

    const queue = await getReviewQueueDetails(db, {
      user: { id: "destination-only-admin", role: "admin" },
    });
    expect(queue.map((q) => q.request.id)).toContain(id);
  });

  it("hides a request whose entity is gone — the queue is strictly in-scope", async () => {
    await seedFixtureUser(db, { id: "zombie-viewer-admin" });
    await seedFixtureUser(db, { id: "zombie-requester" });
    await db.insert(adminAreaScopes).values({ userId: "zombie-viewer-admin", areaId: 5 });

    const id = await submitChangeRequest(db, "climb_delete", 999997, "zombie-requester", {});
    const visibleId = await submitChangeRequest(db, "climb_delete", 2, "zombie-requester", {});

    const queue = await getReviewQueueDetails(db, {
      user: { id: "zombie-viewer-admin", role: "admin" },
    });
    expect(queue.map((q) => q.request.id)).toEqual([visibleId]);
    expect(visibleId).not.toBe(id);
  });

  it("returns nothing for a non-admin session", async () => {
    await seedFixtureUser(db, { id: "non-admin-viewer" });
    await db.insert(adminAreaScopes).values({ userId: "non-admin-viewer", areaId: 1 });

    const visibleId = await submitChangeRequest(db, "area_edit", 1, "moderation-requester", {
      name: "Visible",
    });
    expect(
      (await getReviewQueueDetails(db, { user: { id: "non-admin-viewer", role: "admin" } })).map(
        (q) => q.request.id,
      ),
    ).toEqual([visibleId]);
    const queue = await getReviewQueueDetails(db, {
      user: { id: "non-admin-viewer", role: null },
    });
    expect(queue).toEqual([]);
  });
});

// Fixture tree: Test Crag (1) > Test Boulders (2) > {Test Highball Alcove (4),
// Test Slab Area (5)}, and Test Crag (1) > Test Sport Wall (3).
describe("assertAreaReparentable", () => {
  it("rejects an area as its own parent", async () => {
    await expect(assertAreaReparentable(db, 2, 2)).rejects.toThrow(
      "Can't move an area under itself or one of its own sub-areas",
    );
  });

  it("rejects moving an area under its own descendant", async () => {
    await expect(assertAreaReparentable(db, 2, 4)).rejects.toThrow(
      "Can't move an area under itself or one of its own sub-areas",
    );
  });

  it("rejects an unknown area", async () => {
    await expect(assertAreaReparentable(db, 999999, 3)).rejects.toThrow("Area not found");
  });

  it("rejects an unknown parent", async () => {
    await expect(assertAreaReparentable(db, 3, 999999)).rejects.toThrow("Parent area not found");
  });

  it("returns the existing area for a legal move", async () => {
    const existing = await assertAreaReparentable(db, 3, 5);
    expect(existing.id).toBe(3);
  });
});

describe("assertClimbMovable", () => {
  it("rejects an unknown climb", async () => {
    await expect(assertClimbMovable(db, 999999, 3)).rejects.toThrow("Climb not found");
  });

  it("rejects an unknown area", async () => {
    await expect(assertClimbMovable(db, 1, 999999)).rejects.toThrow("Area not found");
  });

  it("returns the existing climb for a legal move", async () => {
    const existing = await assertClimbMovable(db, 1, 3);
    expect(existing.id).toBe(1);
  });
});

describe("assertClimbMergeable", () => {
  it("rejects merging a climb into itself", async () => {
    await expect(assertClimbMergeable(db, 1, 1)).rejects.toThrow(
      "Can't mark a climb as a duplicate of itself",
    );
  });

  it("rejects an unknown source climb", async () => {
    await expect(assertClimbMergeable(db, 999999, 1)).rejects.toThrow("Climb not found");
  });

  it("rejects an unknown target climb", async () => {
    await expect(assertClimbMergeable(db, 1, 999999)).rejects.toThrow("Target climb not found");
  });

  it("rejects merging climbs of different disciplines", async () => {
    // Climb 1 is a boulder, climb 3 is sport.
    await expect(assertClimbMergeable(db, 1, 3)).rejects.toThrow(
      "Can't mark a climb as a duplicate of a different discipline",
    );
  });

  it("returns both climbs for a legal merge", async () => {
    const { source, target } = await assertClimbMergeable(db, 1, 2);
    expect(source.id).toBe(1);
    expect(target.id).toBe(2);
  });
});

describe("applyAreaEdit", () => {
  it("rejects an empty delta", async () => {
    await expect(applyAreaEdit(db, 1, {})).rejects.toThrow("No changes to apply");
  });

  it("only writes the fields in the delta", async () => {
    await db.update(areas).set({ description: "Keep me" }).where(eq(areas.id, 5));

    await applyAreaEdit(db, 5, { name: "Renamed Slab Area" });

    const row = await db.select().from(areas).where(eq(areas.id, 5)).get();
    expect(row?.name).toBe("Renamed Slab Area");
    expect(row?.description).toBe("Keep me");
  });
});

describe("applyClimbEdit", () => {
  it("rejects an empty delta", async () => {
    await expect(applyClimbEdit(db, 1, {})).rejects.toThrow("No changes to apply");
  });

  it("applies a delta without touching absent fields", async () => {
    await db.insert(climbs).values({
      id: 940,
      areaId: 3,
      name: "Edit Delta",
      type: "boulder",
      grade: 3,
      description: "Untouched",
    });

    await applyClimbEdit(db, 940, { grade: 5 });

    const row = await db.select().from(climbs).where(eq(climbs.id, 940)).get();
    expect(row?.grade).toBe(5);
    expect(row?.description).toBe("Untouched");
    expect(row?.name).toBe("Edit Delta");
  });

  it("still allows a non-discipline delta on a climb with sends", async () => {
    await seedFixtureUser(db, { id: "edit-sender" });
    await db
      .insert(climbs)
      .values({ id: 941, areaId: 3, name: "Edit Sent", type: "boulder", grade: 3 });
    await seedFixtureSend(db, { userId: "edit-sender", climbId: 941, dateSent: "2026-01-01" });

    await applyClimbEdit(db, 941, { name: "Edit Sent Renamed" });

    const row = await db.select().from(climbs).where(eq(climbs.id, 941)).get();
    expect(row?.name).toBe("Edit Sent Renamed");
  });

  it("blocks a discipline change once the climb has sends", async () => {
    await seedFixtureUser(db, { id: "edit-sender" });
    await db
      .insert(climbs)
      .values({ id: 941, areaId: 3, name: "Edit Sent", type: "boulder", grade: 3 });
    await seedFixtureSend(db, { userId: "edit-sender", climbId: 941, dateSent: "2026-01-01" });
    await expect(applyClimbEdit(db, 941, { type: "sport" })).rejects.toThrow(
      "Can't change discipline once a climb has logged sends",
    );
  });
});

describe("applyAreaReparent", () => {
  it("moves the area under its new parent", async () => {
    await db.insert(areas).values({ id: 860, parentId: 1, name: "Reparent Me" });

    await applyAreaReparent(db, 860, 5);

    const row = await db.select().from(areas).where(eq(areas.id, 860)).get();
    expect(row?.parentId).toBe(5);
  });
});

describe("applyClimbMove", () => {
  it("moves the climb to its new area", async () => {
    await db
      .insert(climbs)
      .values({ id: 865, areaId: 3, name: "Move Me", type: "sport", grade: 8 });

    await applyClimbMove(db, 865, 5);

    const row = await db.select().from(climbs).where(eq(climbs.id, 865)).get();
    expect(row?.areaId).toBe(5);
  });
});

describe("applyAreaDelete", () => {
  it("deletes an empty leaf area", async () => {
    await db.insert(areas).values({ id: 870, parentId: 1, name: "Delete Me" });

    await applyAreaDelete(db, 870);

    expect(await db.select().from(areas).where(eq(areas.id, 870)).get()).toBeUndefined();
  });

  it("refuses an area with sub-areas", async () => {
    await expect(assertAreaDeletable(db, 2)).rejects.toThrow("Can't delete an area with sub-areas");
    await expect(applyAreaDelete(db, 2)).rejects.toThrow("Can't delete an area with sub-areas");
  });

  it("refuses an area with climbs directly in it", async () => {
    await expect(applyAreaDelete(db, 3)).rejects.toThrow("Can't delete an area with climbs");
  });
});

describe("applyClimbDelete", () => {
  it("deletes a climb with no sends", async () => {
    await db
      .insert(climbs)
      .values({ id: 875, areaId: 3, name: "Delete Climb", type: "sport", grade: 8 });

    await applyClimbDelete(db, 875);

    expect(await db.select().from(climbs).where(eq(climbs.id, 875)).get()).toBeUndefined();
  });

  it("refuses a climb with logged sends, live-checked at apply time", async () => {
    await seedFixtureUser(db, { id: "delete-sender" });
    await db
      .insert(climbs)
      .values({ id: 876, areaId: 3, name: "Sent Climb", type: "sport", grade: 8 });
    await seedFixtureSend(db, { userId: "delete-sender", climbId: 876, dateSent: "2026-01-01" });

    await expect(assertClimbDeletable(db, 876)).rejects.toThrow(
      "Can't delete a climb with logged sends",
    );
    await expect(applyClimbDelete(db, 876)).rejects.toThrow(
      "Can't delete a climb with logged sends",
    );
    expect(await db.select().from(climbs).where(eq(climbs.id, 876)).get()).toBeDefined();
  });

  it("refuses a climb with journal entries, even without sends", async () => {
    await seedFixtureUser(db, { id: "delete-journaler" });
    await db
      .insert(climbs)
      .values({ id: 877, areaId: 3, name: "Journaled Climb", type: "sport", grade: 8 });
    // A non-sent session note — the ON DELETE restrict FK would abort the
    // delete with a raw driver error without the explicit guard.
    await seedFixtureJournalEntry(db, {
      userId: "delete-journaler",
      climbId: 877,
      entryDate: "2026-01-05",
      body: "Working the crux",
    });

    await expect(assertClimbDeletable(db, 877)).rejects.toThrow(
      "Can't delete a climb with journal entries",
    );
    await expect(applyClimbDelete(db, 877)).rejects.toThrow(
      "Can't delete a climb with journal entries",
    );
    expect(await db.select().from(climbs).where(eq(climbs.id, 877)).get()).toBeDefined();
  });
});

describe("applyClimbMerge", () => {
  it("rejects a discipline mismatch without touching either climb", async () => {
    await db.insert(climbs).values([
      { id: 900, areaId: 3, name: "Merge Boulder", type: "boulder", grade: 3 },
      { id: 901, areaId: 3, name: "Merge Sport", type: "sport", grade: 8 },
    ]);

    await expect(applyClimbMerge(db, 900, 901)).rejects.toThrow(
      "Can't mark a climb as a duplicate of a different discipline",
    );
    expect(await db.select().from(climbs).where(eq(climbs.id, 900)).get()).toBeDefined();
    expect(await db.select().from(climbs).where(eq(climbs.id, 901)).get()).toBeDefined();
  });

  it("reassigns a non-colliding send and deletes the source climb", async () => {
    await seedFixtureUser(db, { id: "merge-user-a" });
    await db.insert(climbs).values([
      { id: 910, areaId: 3, name: "Merge Source A", type: "boulder", grade: 3 },
      { id: 911, areaId: 3, name: "Merge Target A", type: "boulder", grade: 3 },
    ]);
    await seedFixtureSend(db, {
      userId: "merge-user-a",
      climbId: 910,
      dateSent: "2026-01-01",
      rating: 4,
    });

    await applyClimbMerge(db, 910, 911);

    expect(await db.select().from(climbs).where(eq(climbs.id, 910)).get()).toBeUndefined();
    const target = await db.select().from(climbs).where(eq(climbs.id, 911)).get();
    expect(target?.sendCount).toBe(1);
    expect(target?.ratingSum).toBe(4);

    const send = await db.select().from(sends).where(eq(sends.userId, "merge-user-a")).get();
    expect(send?.climbId).toBe(911);
    expect(send?.rating).toBe(4);
  });

  it("keeps the target's send wholesale when a user sent both climbs", async () => {
    await seedFixtureUser(db, { id: "merge-user-b" });
    await db.insert(climbs).values([
      { id: 920, areaId: 3, name: "Merge Source B", type: "boulder", grade: 3 },
      { id: 921, areaId: 3, name: "Merge Target B", type: "boulder", grade: 3 },
    ]);
    await seedFixtureSend(db, {
      userId: "merge-user-b",
      climbId: 920,
      dateSent: "2026-01-01",
      comment: "Source comment",
      rating: 5,
    });
    await seedFixtureSend(db, {
      userId: "merge-user-b",
      climbId: 921,
      dateSent: "2026-02-01",
      comment: "Target comment",
      rating: 2,
    });

    await applyClimbMerge(db, 920, 921);

    expect(await db.select().from(climbs).where(eq(climbs.id, 920)).get()).toBeUndefined();
    const rows = await db.select().from(sends).where(eq(sends.userId, "merge-user-b"));
    expect(rows).toHaveLength(1);
    expect(rows[0].climbId).toBe(921);
    // The target's send survives untouched — folding the source's comment in
    // would desync it from its ascent journal entry (send_journal_update_guard);
    // a dated source send's comment lives on in its journal entry instead.
    expect(rows[0].dateSent).toBe("2026-02-01");
    expect(rows[0].rating).toBe(2);
    expect(rows[0].comment).toBe("Target comment");

    const target = await db.select().from(climbs).where(eq(climbs.id, 921)).get();
    expect(target?.sendCount).toBe(1);
  });

  it("moves journal entries with their sends and keeps the ascent flag", async () => {
    await seedFixtureUser(db, { id: "merge-journal-a" });
    await db.insert(climbs).values([
      { id: 800, areaId: 3, name: "Journal Merge Source A", type: "boulder", grade: 3 },
      { id: 801, areaId: 3, name: "Journal Merge Target A", type: "boulder", grade: 3 },
    ]);
    await seedFixtureSend(db, {
      userId: "merge-journal-a",
      climbId: 800,
      dateSent: "2026-01-01",
      comment: "First go",
    });
    // The ascent entry mirrors its send (entry_date/body must match — see
    // journal_sent_insert_guard), plus a later repeat and a non-sent note.
    await seedFixtureJournalEntry(db, {
      userId: "merge-journal-a",
      climbId: 800,
      entryDate: "2026-01-01",
      sent: true,
      isAscent: true,
      body: "First go",
    });
    await seedFixtureJournalEntry(db, {
      userId: "merge-journal-a",
      climbId: 800,
      entryDate: "2026-01-15",
      sent: true,
      body: "Repeat lap",
    });
    await seedFixtureJournalEntry(db, {
      userId: "merge-journal-a",
      climbId: 800,
      entryDate: "2026-01-20",
      body: "Just a session note",
    });

    await applyClimbMerge(db, 800, 801);

    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "merge-journal-a"))
      .orderBy(journalEntries.entryDate);
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.climbId === 801)).toBe(true);
    expect(entries[0].isAscent).toBe(true);
    expect(entries[0].sent).toBe(true);
    expect(entries[1].isAscent).toBe(false);
    expect(entries[1].sent).toBe(true);
    expect(entries[2].sent).toBe(false);
  });

  it("demotes the colliding user's source entries and moves them without an ascent clash", async () => {
    await seedFixtureUser(db, { id: "merge-journal-b" });
    await db.insert(climbs).values([
      { id: 810, areaId: 3, name: "Journal Merge Source B", type: "boulder", grade: 3 },
      { id: 811, areaId: 3, name: "Journal Merge Target B", type: "boulder", grade: 3 },
    ]);
    await seedFixtureSend(db, {
      userId: "merge-journal-b",
      climbId: 810,
      dateSent: "2026-01-01",
      comment: "Source story",
    });
    await seedFixtureSend(db, {
      userId: "merge-journal-b",
      climbId: 811,
      dateSent: "2026-02-01",
      comment: "Target story",
    });
    await seedFixtureJournalEntry(db, {
      userId: "merge-journal-b",
      climbId: 810,
      entryDate: "2026-01-01",
      sent: true,
      isAscent: true,
      body: "Source story",
    });
    await seedFixtureJournalEntry(db, {
      userId: "merge-journal-b",
      climbId: 811,
      entryDate: "2026-02-01",
      sent: true,
      isAscent: true,
      body: "Target story",
    });

    await applyClimbMerge(db, 810, 811);

    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "merge-journal-b"))
      .orderBy(journalEntries.entryDate);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.climbId === 811)).toBe(true);
    // The source-side entry was demoted by send_journal_delete_sync when its
    // send was deleted — its text survives, but the target keeps the one
    // ascent (journal_ascent_unique).
    expect(entries[0].body).toBe("Source story");
    expect(entries[0].sent).toBe(false);
    expect(entries[0].isAscent).toBe(false);
    expect(entries[1].body).toBe("Target story");
    expect(entries[1].isAscent).toBe(true);
  });

  it("preserves an undated colliding send's comment as a journal note on the target", async () => {
    await seedFixtureUser(db, {
      id: "merge-journal-c",
      journalVisibility: "public",
      sendCommentVisibility: "private",
    });
    await db.insert(climbs).values([
      { id: 820, areaId: 3, name: "Journal Merge Source C", type: "boulder", grade: 3 },
      { id: 821, areaId: 3, name: "Journal Merge Target C", type: "boulder", grade: 3 },
    ]);
    // Undated source send: no journal entry can carry its comment (an ascent
    // entry needs a dated send), so the merge writes it into a non-sent note.
    await seedFixtureSend(db, {
      userId: "merge-journal-c",
      climbId: 820,
      dateSent: null,
      comment: "Beta worth keeping",
    });
    await seedFixtureSend(db, {
      userId: "merge-journal-c",
      climbId: 821,
      dateSent: "2026-02-01",
    });

    await applyClimbMerge(db, 820, 821);

    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "merge-journal-c"));
    expect(entries).toHaveLength(1);
    expect(entries[0].climbId).toBe(821);
    expect(entries[0].sent).toBe(false);
    expect(entries[0].body).toBe("Beta worth keeping");
    expect(await getJournalForClimb(db, "merge-journal-c", "reader", 821)).toMatchObject([
      { id: entries[0].id, body: null, isSendComment: true },
    ]);
  });

  it("moves session notes from users who never sent the source climb", async () => {
    await seedFixtureUser(db, { id: "merge-journal-d" });
    await db.insert(climbs).values([
      { id: 830, areaId: 3, name: "Journal Merge Source D", type: "boulder", grade: 3 },
      { id: 831, areaId: 3, name: "Journal Merge Target D", type: "boulder", grade: 3 },
    ]);
    await seedFixtureJournalEntry(db, {
      userId: "merge-journal-d",
      climbId: 830,
      entryDate: "2026-03-01",
      body: "Projecting notes",
    });

    // Without the journal reassignment, deleting the source would abort on
    // the entries' ON DELETE restrict FK.
    await applyClimbMerge(db, 830, 831);

    expect(await db.select().from(climbs).where(eq(climbs.id, 830)).get()).toBeUndefined();
    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "merge-journal-d"));
    expect(entry.climbId).toBe(831);
    expect(entry.body).toBe("Projecting notes");
  });

  it("applies validated overrides to the surviving climb", async () => {
    await db.insert(climbs).values([
      { id: 930, areaId: 3, name: "Merge Source C", type: "boulder", grade: 3 },
      { id: 931, areaId: 3, name: "Merge Target C", type: "boulder", grade: 3 },
    ]);

    await applyClimbMerge(db, 930, 931, { name: "Merged Name", grade: 5 });

    const target = await db.select().from(climbs).where(eq(climbs.id, 931)).get();
    expect(target?.name).toBe("Merged Name");
    expect(target?.grade).toBe(5);
  });

  it("ignores non-whitelisted override keys instead of writing them", async () => {
    await seedFixtureUser(db, { id: "merge-user-d" });
    await db.insert(climbs).values([
      { id: 950, areaId: 3, name: "Merge Source D", type: "boulder", grade: 3 },
      { id: 951, areaId: 4, name: "Merge Target D", type: "boulder", grade: 3 },
    ]);

    // A crafted overrides object trying to rewrite columns a merge must
    // never touch — only `name` is whitelisted, the rest never reach the
    // UPDATE.
    await applyClimbMerge(db, 950, 951, {
      name: "Sanitized",
      areaId: 999999,
      sendCount: 9999,
      type: "sport",
      id: 777,
    });

    const target = await db.select().from(climbs).where(eq(climbs.id, 951)).get();
    expect(target?.name).toBe("Sanitized");
    expect(target?.areaId).toBe(4);
    expect(target?.sendCount).toBe(0);
    expect(target?.type).toBe("boulder");
  });

  it("rejects an out-of-scale override grade", async () => {
    await db.insert(climbs).values([
      { id: 960, areaId: 3, name: "Merge Source E", type: "boulder", grade: 3 },
      { id: 961, areaId: 3, name: "Merge Target E", type: "boulder", grade: 3 },
    ]);

    await expect(applyClimbMerge(db, 960, 961, { grade: 999 })).rejects.toThrow("Invalid grade");
    // The failed validation must not have merged anything.
    expect(await db.select().from(climbs).where(eq(climbs.id, 960)).get()).toBeDefined();
  });
});

describe("orphaned request auto-rejection", () => {
  beforeEach(async () => {
    await seedFixtureUser(db, { id: "orphan-requester" });
  });

  it("rejects pending requests on a deleted climb, including merges targeting it", async () => {
    await db.insert(climbs).values([
      { id: 884, areaId: 3, name: "Orphan Deleted", type: "boulder", grade: 3 },
      { id: 885, areaId: 3, name: "Orphan Merge Source", type: "boulder", grade: 3 },
    ]);
    const editId = await submitChangeRequest(db, "climb_edit", 884, "orphan-requester", {
      name: "Never Happens",
    });
    const mergeIntoId = await submitChangeRequest(db, "climb_merge", 885, "orphan-requester", {
      targetClimbId: 884,
    });

    await applyClimbDelete(db, 884);

    const edit = await loadRequest(editId);
    expect(edit.status).toBe("rejected");
    expect(edit.reviewNote).toBe("The area or climb this request affected no longer exists.");
    expect(edit.reviewedBy).toBeNull();
    expect((await loadRequest(mergeIntoId)).status).toBe("rejected");
  });

  it("rejects pending requests stranded by a merge, atomically with it", async () => {
    await db.insert(climbs).values([
      { id: 886, areaId: 3, name: "Orphan Merge Away", type: "boulder", grade: 3 },
      { id: 887, areaId: 3, name: "Orphan Merge Target", type: "boulder", grade: 3 },
    ]);
    const editId = await submitChangeRequest(db, "climb_edit", 886, "orphan-requester", {
      name: "Stranded",
    });

    await applyClimbMerge(db, 886, 887);

    expect((await loadRequest(editId)).status).toBe("rejected");
  });

  it("rejects reparents and moves whose destination area was deleted", async () => {
    await db.insert(areas).values({ id: 872, parentId: 1, name: "Orphan Destination" });
    const reparentId = await submitChangeRequest(db, "area_reparent", 5, "orphan-requester", {
      newParentId: 872,
    });
    const moveId = await submitChangeRequest(db, "climb_move", 2, "orphan-requester", {
      newAreaId: 872,
    });

    const untouchedId = await submitChangeRequest(db, "area_edit", 1, "orphan-requester", {
      name: "Still pending",
    });
    await applyAreaDelete(db, 872);

    expect((await loadRequest(reparentId)).status).toBe("rejected");
    expect((await loadRequest(moveId)).status).toBe("rejected");
    // Unrelated pending requests are untouched.
    const untouched = await db
      .select()
      .from(changeRequests)
      .where(and(eq(changeRequests.status, "pending"), eq(changeRequests.type, "area_edit")));
    expect(untouched.map((row) => row.id)).toEqual([untouchedId]);
  });
});

describe("describeChangeRequest", () => {
  beforeEach(async () => {
    await seedFixtureUser(db, { id: "describe-requester" });
  });

  it("spells out every field a climb_edit would change", async () => {
    await db.insert(climbs).values({
      id: 970,
      areaId: 3,
      name: "Describe Me",
      type: "boulder",
      grade: 3,
      description: "Old description",
    });
    const id = await submitChangeRequest(db, "climb_edit", 970, "describe-requester", {
      name: "Described",
      grade: 5,
    });

    const description = await describeChangeRequest(db, await loadRequest(id));
    expect(description.summary).toBe('Rename "Describe Me" to "Described"');
    expect(description.details).toEqual([
      'Name: "Describe Me" → "Described"',
      `Grade: ${formatGrade("boulder", 3)} → ${formatGrade("boulder", 5)}`,
    ]);
  });

  it("summarizes a non-rename edit as an edit, not a rename", async () => {
    const id = await submitChangeRequest(db, "climb_edit", 1, "describe-requester", {
      grade: 5,
    });
    const description = await describeChangeRequest(db, await loadRequest(id));
    expect(description.summary).toMatch(/^Edit "/);
    expect(description.details).toHaveLength(1);
  });

  it("shows a reparent's current and requested parent", async () => {
    const id = await submitChangeRequest(db, "area_reparent", 4, "describe-requester", {
      newParentId: 3,
    });
    const description = await describeChangeRequest(db, await loadRequest(id));
    expect(description.details).toEqual(['Parent: "Test Boulders" → "Test Sport Wall"']);
  });

  it("surfaces merge overrides and the send count moving", async () => {
    await seedFixtureUser(db, { id: "describe-merge-sender" });
    await db.insert(climbs).values([
      { id: 980, areaId: 3, name: "Describe Source", type: "boulder", grade: 3 },
      { id: 981, areaId: 3, name: "Describe Target", type: "boulder", grade: 4 },
    ]);
    await seedFixtureSend(db, {
      userId: "describe-merge-sender",
      climbId: 980,
      dateSent: "2026-03-01",
    });
    const id = await submitChangeRequest(db, "climb_merge", 980, "describe-requester", {
      targetClimbId: 981,
      overrides: { name: "Merged Describe", grade: 6 },
    });

    const description = await describeChangeRequest(db, await loadRequest(id));
    expect(description.summary).toBe('Merge "Describe Source" into "Describe Target"');
    expect(description.requesterSummary).toBe(
      'Mark "Describe Source" as a duplicate of "Describe Target"',
    );
    expect(description.details).toEqual([
      '1 send(s) move to "Describe Target"',
      'Name: "Describe Target" → "Merged Describe"',
      `Grade: ${formatGrade("boulder", 4)} → ${formatGrade("boulder", 6)}`,
    ]);
  });
});
