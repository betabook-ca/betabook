import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createArea, createClimb } from "@/actions";
import { createDb } from "@/db/client";
import { getArea, getSubtreeClimbs, findClimbCandidatesByNames } from "@/db/queries";
import { seedFixtureTree } from "@/test/fixtures";

// Area ancestry must be visible immediately after creation, without background repair.

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    getSession: async () => ({ user: { id: "test-user" } }),
    requireSession: async () => ({ user: { id: "test-user" } }),
    NotSignedInError,
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

function areaForm(name: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("description", "");
  return formData;
}

function climbForm(name: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("type", "boulder");
  formData.set("grade", "5");
  formData.set("description", "");
  return formData;
}

/** Fixture tree: Test Crag (1) > Test Boulders (2) > {Test Highball Alcove
 * (4), Test Slab Area (5)}, and Test Crag (1) > Test Sport Wall (3). */
const TEST_CRAG = 1;
const TEST_BOULDERS = 2;
const TEST_SPORT_WALL = 3;

async function climbNamesUnder(areaId: number): Promise<string[]> {
  const area = await getArea(db, areaId);
  const { climbs } = await getSubtreeClimbs(db, area!, 1, "name_asc");
  return climbs.map((c) => c.name);
}

beforeAll(async () => {
  await seedFixtureTree(db);
});

describe("a brand-new area is immediately correct", () => {
  it("shows its climb on its own page and every ancestor's, and nowhere else", async () => {
    const created = await createArea(TEST_BOULDERS, areaForm("Test Roof Cave"));
    expect(created.ok).toBe(true);
    const newAreaId = created.ok ? created.value : 0;

    const climb = await createClimb(newAreaId, climbForm("Test Roof Problem"));
    expect(climb.ok).toBe(true);

    expect(await climbNamesUnder(newAreaId)).toEqual(["Test Roof Problem"]);

    expect(await climbNamesUnder(TEST_BOULDERS)).toContain("Test Roof Problem");
    expect(await climbNamesUnder(TEST_CRAG)).toContain("Test Roof Problem");

    expect(await climbNamesUnder(TEST_SPORT_WALL)).not.toContain("Test Roof Problem");
  });

  it("reports its full ancestor chain to the CSV import lookup immediately", async () => {
    const created = await createArea(TEST_BOULDERS, areaForm("Test Import Alcove"));
    const newAreaId = created.ok ? created.value : 0;
    await createClimb(newAreaId, climbForm("Test Imported Climb"));

    const [found] = await findClimbCandidatesByNames(db, ["Test Imported Climb"]);
    expect(found.areaId).toBe(newAreaId);
    expect(found.areaName).toBe("Test Import Alcove");
    expect(found.ancestors.map((a) => a.name)).toEqual(["Test Crag", "Test Boulders"]);
  });

  it("keeps concurrent creates under different parents out of each other's listings", async () => {
    const [underBoulders, underSportWall] = await Promise.all([
      createArea(TEST_BOULDERS, areaForm("Test Parallel Boulders Bay")),
      createArea(TEST_SPORT_WALL, areaForm("Test Parallel Sport Bay")),
    ]);
    const bouldersBayId = underBoulders.ok ? underBoulders.value : 0;
    const sportBayId = underSportWall.ok ? underSportWall.value : 0;

    await Promise.all([
      createClimb(bouldersBayId, climbForm("Test Parallel Boulder Problem")),
      createClimb(sportBayId, climbForm("Test Parallel Sport Route")),
    ]);

    expect(await climbNamesUnder(bouldersBayId)).toEqual(["Test Parallel Boulder Problem"]);
    expect(await climbNamesUnder(sportBayId)).toEqual(["Test Parallel Sport Route"]);
  });
});

describe("creating an area doesn't rewrite the rest of the tree", () => {
  it("leaves every pre-existing area and climb row untouched", async () => {
    const before = {
      areas: await db.all(sqlAllAreas()),
      climbs: await db.all(sqlAllClimbs()),
    };

    const created = await createArea(TEST_BOULDERS, areaForm("Test Untouched Bay"));
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    const newAreaId = created.value;
    const climb = await createClimb(newAreaId, climbForm("Test Untouched Problem"));
    expect(climb.ok).toBe(true);
    expect(await climbNamesUnder(newAreaId)).toEqual(["Test Untouched Problem"]);

    const after = {
      areas: (await db.all<{ id: number }>(sqlAllAreas())).filter((r) => r.id !== newAreaId),
      climbs: (await db.all<{ areaId: number }>(sqlAllClimbs())).filter(
        (r) => r.areaId !== newAreaId,
      ),
    };

    expect(after.areas).toEqual(before.areas);
    expect(after.climbs).toEqual(before.climbs);
  });
});

// The mutation must require a parent independently of the form's validation.
describe("a new area always goes under an existing one", () => {
  it("refuses a parent id that isn't an area", async () => {
    const created = await createArea(999999, areaForm("Test Orphan Wall"));
    expect(created).toEqual({ ok: false, error: "Parent area not found" });
  });

  it("refuses a missing parent rather than creating a root", async () => {
    const rootsBefore = await countRoots();

    // The signature rules this out for typed callers; the cast is the
    // untyped request such an endpoint can still be sent.
    const created = await createArea(null as unknown as number, areaForm("Test Orphan Continent"));

    expect(created).toEqual({ ok: false, error: "Parent area not found" });
    expect(await countRoots()).toBe(rootsBefore);
  });
});

async function countRoots(): Promise<number> {
  const { results } = await db.run(sql`SELECT COUNT(*) AS n FROM areas WHERE parent_id IS NULL`);
  return (results[0] as { n: number }).n;
}

function sqlAllAreas() {
  return sql`SELECT id, parent_id AS parentId, name, description FROM areas ORDER BY id`;
}
function sqlAllClimbs() {
  return sql`
    SELECT id, area_id AS areaId, name, type, grade, send_count AS sendCount
    FROM climbs ORDER BY id
  `;
}
