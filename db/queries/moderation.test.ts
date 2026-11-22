import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { adminAreaScopes, changeRequestApprovals, changeRequests } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";

import {
  getChangeRequest,
  getApprovalCoverageRows,
  getManagedAreas,
  getScopedPendingRequests,
} from "./moderation";

let db: Database;

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "queries-requester" });
  await seedFixtureUser(db, { id: "queue-reviewer", role: "admin" });
  await db.insert(adminAreaScopes).values({ userId: "queue-reviewer", areaId: 1 });

  await db.insert(changeRequests).values([
    {
      id: 101,
      type: "area_edit",
      entityId: 1,
      payload: "{}",
      requestedBy: "queries-requester",
      requestedAt: new Date(2000),
    },
    {
      id: 102,
      type: "climb_delete",
      entityId: 1,
      payload: "{}",
      requestedBy: "queries-requester",
      requestedAt: new Date(1000),
    },
    {
      id: 103,
      type: "climb_delete",
      entityId: 2,
      payload: "{}",
      requestedBy: "queries-requester",
      status: "approved",
      reviewedBy: "queries-requester",
    },
  ]);
});

describe("getChangeRequest", () => {
  it("returns the row for a known id", async () => {
    const request = await getChangeRequest(db, 101);
    expect(request?.type).toBe("area_edit");
  });

  it("returns undefined for an unknown id", async () => {
    expect(await getChangeRequest(db, 999999)).toBeUndefined();
  });
});

describe("getScopedPendingRequests", () => {
  it("only returns pending requests, oldest first", async () => {
    const pending = await getScopedPendingRequests(db, "queue-reviewer");
    const ids = pending.map((r) => r.request.id);
    expect(ids).toEqual([102, 101]);
  });
});

describe("getApprovalCoverageRows", () => {
  it("returns approvals for the request, oldest first", async () => {
    await seedFixtureUser(db, { id: "queries-approver-a" });
    await seedFixtureUser(db, { id: "queries-approver-b" });
    await db.insert(changeRequestApprovals).values([
      { requestId: 101, userId: "queries-approver-a", createdAt: new Date(2000) },
      { requestId: 101, userId: "queries-approver-b", createdAt: new Date(1000) },
    ]);

    const approvals = await getApprovalCoverageRows(db, [
      { request: (await getChangeRequest(db, 101))!, scopeAreaIds: [1] },
    ]);
    expect(approvals.map((a) => a.userId)).toEqual(["queries-approver-b", "queries-approver-a"]);
  });

  it("is empty for a request with no approvals", async () => {
    expect(
      await getApprovalCoverageRows(db, [
        { request: (await getChangeRequest(db, 102))!, scopeAreaIds: [4] },
      ]),
    ).toEqual([]);
  });
});

describe("getManagedAreas", () => {
  it("returns the granted areas by name, not the expanded subtree", async () => {
    await seedFixtureUser(db, { id: "queries-scoped-admin" });
    // Areas 2 (Test Boulders) and 3 (Test Sport Wall) — area 2's children
    // (4, 5) are covered by the grant but must not appear here.
    await db.insert(adminAreaScopes).values([
      { userId: "queries-scoped-admin", areaId: 3 },
      { userId: "queries-scoped-admin", areaId: 2 },
    ]);

    const managed = await getManagedAreas(db, "queries-scoped-admin");
    expect(managed.map((area) => area.name)).toEqual(["Test Boulders", "Test Sport Wall"]);
  });

  it("is empty for a user with no grants", async () => {
    expect(await getManagedAreas(db, "queries-requester")).toEqual([]);
  });
});
