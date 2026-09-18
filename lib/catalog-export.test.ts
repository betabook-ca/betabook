import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { countAreas } from "@/db/queries/areas";
import { countClimbs } from "@/db/queries/climbs";
import { climbs } from "@/db/schema";
import { seedFixtureTree, seedManyAreas, seedManyClimbs } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import {
  buildCatalogExport,
  CATALOG_EXPORT_KEY,
  CATALOG_EXPORT_SCHEMA_VERSION,
  catalogExportFilename,
  getCatalogExportInfo,
  runScheduledCatalogExport,
  writeCatalogExport,
} from "./catalog-export";

const db = createDb(env.DB);
const NOW = new Date("2026-09-14T06:00:00.000Z");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await resetDb(db);
  await env.CATALOG_EXPORTS.delete(CATALOG_EXPORT_KEY);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

it("reads every row once across many keyset pages", async () => {
  await seedFixtureTree(db);
  await seedManyAreas(db, 7, 10);
  await seedManyClimbs(db, 4, 30, 100);
  const snapshot = await buildCatalogExport(db, NOW, 3);
  expect(snapshot.areas).toHaveLength(await countAreas(db));
  expect(snapshot.climbs).toHaveLength(await countClimbs(db));
  expect(new Set(snapshot.areas.map((area) => area.id)).size).toBe(snapshot.areas.length);
  expect(new Set(snapshot.climbs.map((climb) => climb.id)).size).toBe(snapshot.climbs.length);
  const ids = snapshot.climbs.map((climb) => climb.id);
  expect(ids).toEqual(ids.toSorted((a, b) => a - b));
});

it("labels grades in the discipline's native scale and keeps null grades null", async () => {
  await seedFixtureTree(db);
  await db
    .insert(climbs)
    .values({ id: 9, areaId: 3, name: "Ungraded", type: "sport", grade: null });
  const snapshot = await buildCatalogExport(db, NOW);
  const byId = new Map(snapshot.climbs.map((climb) => [climb.id, climb]));
  expect(byId.get(1)).toMatchObject({ type: "boulder", grade: 5, gradeLabel: "V4" });
  expect(byId.get(3)).toMatchObject({ type: "sport", grade: 10, gradeLabel: "5.10a" });
  expect(byId.get(9)).toMatchObject({ grade: null, gradeLabel: null });
  expect(Object.keys(byId.get(1)!).sort()).toEqual(
    ["areaId", "description", "grade", "gradeLabel", "id", "name", "type"].sort(),
  );
});

it("writes the snapshot to R2 with counts in the object metadata", async () => {
  await seedFixtureTree(db);
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toBeNull();
  expect(await getCatalogExportInfo(undefined)).toBeNull();

  const info = await runScheduledCatalogExport(env, NOW);
  expect(info).toMatchObject({
    generatedAt: NOW.toISOString(),
    areaCount: 5,
    climbCount: 4,
  });

  const object = await env.CATALOG_EXPORTS.get(CATALOG_EXPORT_KEY);
  expect(object).not.toBeNull();
  expect(object!.httpMetadata?.contentType).toBe("application/json; charset=utf-8");
  expect(object!.size).toBe(info.size);
  const body = JSON.parse(await object!.text());
  expect(body.schemaVersion).toBe(CATALOG_EXPORT_SCHEMA_VERSION);
  expect(body.generatedAt).toBe(NOW.toISOString());
  expect(body.areas).toHaveLength(5);
  expect(body.climbs).toHaveLength(4);
  expect(JSON.stringify(body)).not.toMatch(/sendCount|ratingSum|ratingCount|avgRating/);

  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toEqual({
    generatedAt: NOW.toISOString(),
    areaCount: 5,
    climbCount: 4,
    size: info.size,
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("5 areas, 4 climbs"));
});

it("treats an object without usable metadata as no snapshot", async () => {
  await env.CATALOG_EXPORTS.put(CATALOG_EXPORT_KEY, "{}", {
    customMetadata: { generatedAt: "not a date", areaCount: "5", climbCount: "4" },
  });
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toBeNull();
  await env.CATALOG_EXPORTS.put(CATALOG_EXPORT_KEY, "{}", {
    customMetadata: { generatedAt: NOW.toISOString(), areaCount: "five", climbCount: "4" },
  });
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toBeNull();
});

it("overwrites the previous snapshot in place", async () => {
  await seedFixtureTree(db);
  await writeCatalogExport(env.CATALOG_EXPORTS, await buildCatalogExport(db, NOW));
  await seedManyClimbs(db, 4, 3, 100);
  const later = new Date("2026-09-21T06:00:00.000Z");
  await runScheduledCatalogExport(env, later);
  const list = await env.CATALOG_EXPORTS.list({ prefix: "catalog/" });
  expect(list.objects.map((object) => object.key)).toEqual([CATALOG_EXPORT_KEY]);
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toMatchObject({
    generatedAt: later.toISOString(),
    climbCount: 7,
  });
});

it("names the download after the snapshot date", () => {
  expect(catalogExportFilename("2026-09-14T06:00:00.000Z")).toBe(
    "betabook-catalog-2026-09-14.json",
  );
  expect(catalogExportFilename(undefined)).toBe("betabook-catalog.json");
  expect(catalogExportFilename("garbage")).toBe("betabook-catalog.json");
});
