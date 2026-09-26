import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { countAreas } from "@/db/queries/areas";
import { countClimbs } from "@/db/queries/climbs";
import { climbs } from "@/db/schema";
import { insertInBatches, seedFixtureTree, seedManyAreas, seedManyClimbs } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import {
  CATALOG_EXPORT_KEY,
  CATALOG_EXPORT_PART_SIZE,
  CATALOG_EXPORT_SCHEMA_VERSION,
  catalogExportFilename,
  catalogExportJson,
  fixedSizeParts,
  getCatalogExportInfo,
  runScheduledCatalogExport,
  writeCatalogExport,
  type CatalogExportBucket,
} from "./catalog-export";

const db = createDb(env.DB);
const NOW = new Date("2026-09-14T06:00:00.000Z");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await resetDb(db);
  await env.CATALOG_EXPORTS.delete(CATALOG_EXPORT_KEY);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function collectText(chunks: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

async function collectParts(parts: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const part of parts) out.push(part);
  return out;
}

async function* chunksOf(...items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

function joined(parts: Uint8Array[]): string {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(bytes);
}

/** Enough ASCII-described climbs to push the JSON past one 5 MiB part. */
async function seedLargeCatalog(count: number) {
  const description = "x".repeat(1100);
  const rows = Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    areaId: 4,
    name: `Big ${i}`,
    type: "boulder" as const,
    grade: i % 19,
    description,
  }));
  await insertInBatches(db, rows, 10, (chunk) => db.insert(climbs).values(chunk));
}

/** The real bucket, with the upload's part calls observed and one of them
 * optionally failed. */
function observedBucket(failPart?: number) {
  const partSizes: number[] = [];
  const aborted: string[] = [];
  const bucket: CatalogExportBucket = {
    createMultipartUpload: async (key, options) => {
      const upload = await env.CATALOG_EXPORTS.createMultipartUpload(key, options);
      return {
        key: upload.key,
        uploadId: upload.uploadId,
        uploadPart: (partNumber, value, options) => {
          if (partNumber === failPart) return Promise.reject(new Error("R2 hiccup"));
          partSizes.push((value as Uint8Array).byteLength);
          return upload.uploadPart(partNumber, value, options);
        },
        abort: async () => {
          aborted.push(upload.uploadId);
          await upload.abort();
        },
        complete: (parts) => upload.complete(parts),
      };
    },
  };
  return { bucket, partSizes, aborted };
}

it("reads every row once across many keyset pages, as compact JSON", async () => {
  await seedFixtureTree(db);
  await seedManyAreas(db, 7, 10);
  await seedManyClimbs(db, 4, 30, 100);
  const text = await collectText(catalogExportJson(db, NOW, 3));
  const snapshot = JSON.parse(text);
  expect(text).toBe(JSON.stringify(snapshot));
  expect(Object.keys(snapshot)).toEqual(["schemaVersion", "generatedAt", "areas", "climbs"]);
  expect(snapshot.schemaVersion).toBe(CATALOG_EXPORT_SCHEMA_VERSION);
  expect(snapshot.generatedAt).toBe(NOW.toISOString());
  expect(snapshot.areas).toHaveLength(await countAreas(db));
  expect(snapshot.climbs).toHaveLength(await countClimbs(db));
  expect(new Set(snapshot.areas.map((area: { id: number }) => area.id)).size).toBe(
    snapshot.areas.length,
  );
  const ids: number[] = snapshot.climbs.map((climb: { id: number }) => climb.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(ids.toSorted((a, b) => a - b));
});

it("labels grades in the discipline's native scale and keeps null grades null", async () => {
  await seedFixtureTree(db);
  await db
    .insert(climbs)
    .values({ id: 9, areaId: 3, name: "Ungraded", type: "sport", grade: null });
  const snapshot = JSON.parse(await collectText(catalogExportJson(db, NOW)));
  const byId = new Map<number, Record<string, unknown>>(
    snapshot.climbs.map((climb: { id: number }) => [climb.id, climb]),
  );
  expect(byId.get(1)).toMatchObject({ type: "boulder", grade: 5, gradeLabel: "V4" });
  expect(byId.get(3)).toMatchObject({ type: "sport", grade: 10, gradeLabel: "5.10a" });
  expect(byId.get(9)).toMatchObject({ grade: null, gradeLabel: null });
  expect(Object.keys(byId.get(1)!).sort()).toEqual(
    ["areaId", "description", "grade", "gradeLabel", "id", "name", "type"].sort(),
  );
});

it("cuts text into parts of exactly the requested size, then one shorter tail", async () => {
  const parts = await collectParts(fixedSizeParts(chunksOf("ab", "cdef", "", "g", "hij"), 4));
  expect(parts.map((part) => part.length)).toEqual([4, 4, 2]);
  expect(joined(parts)).toBe("abcdefghij");

  const spanning = await collectParts(fixedSizeParts(chunksOf("0123456789"), 4));
  expect(spanning.map((part) => part.length)).toEqual([4, 4, 2]);
  expect(joined(spanning)).toBe("0123456789");

  const exact = await collectParts(fixedSizeParts(chunksOf("abcd", "efgh"), 4));
  expect(exact.map((part) => part.length)).toEqual([4, 4]);

  const multibyte = await collectParts(fixedSizeParts(chunksOf("aé", "€b"), 3));
  expect(multibyte.map((part) => part.length)).toEqual([3, 3, 1]);
  expect(joined(multibyte)).toBe("aé€b");

  await expect(collectParts(fixedSizeParts(chunksOf("a"), 0))).rejects.toThrow(RangeError);
});

it("writes the snapshot to R2 with counts in the object metadata", async () => {
  await seedFixtureTree(db);
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toBeNull();

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
  const text = await object!.text();
  const body = JSON.parse(text);
  expect(text).toBe(JSON.stringify(body));
  expect(body.schemaVersion).toBe(CATALOG_EXPORT_SCHEMA_VERSION);
  expect(body.generatedAt).toBe(NOW.toISOString());
  expect(body.areas).toHaveLength(5);
  expect(body.climbs).toHaveLength(4);
  expect(text).not.toMatch(/sendCount|ratingSum|ratingCount|avgRating/);

  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toEqual({
    generatedAt: NOW.toISOString(),
    areaCount: 5,
    climbCount: 4,
    size: info.size,
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("5 areas, 4 climbs"));
});

it("uploads a catalog wider than one part as equal parts and one tail", async () => {
  await seedFixtureTree(db);
  await seedLargeCatalog(5000);
  const { bucket, partSizes } = observedBucket();

  const info = await writeCatalogExport(bucket, db, NOW);
  expect(info.climbCount).toBe(5004);
  expect(info.size).toBeGreaterThan(CATALOG_EXPORT_PART_SIZE);
  expect(partSizes.length).toBeGreaterThanOrEqual(2);
  expect(partSizes.slice(0, -1)).toEqual(
    Array.from({ length: partSizes.length - 1 }, () => CATALOG_EXPORT_PART_SIZE),
  );
  expect(partSizes.at(-1)).toBeLessThanOrEqual(CATALOG_EXPORT_PART_SIZE);
  expect(partSizes.reduce((total, size) => total + size, 0)).toBe(info.size);

  const object = await env.CATALOG_EXPORTS.get(CATALOG_EXPORT_KEY);
  expect(object!.size).toBe(info.size);
  const body = JSON.parse(await object!.text());
  expect(body.climbs).toHaveLength(5004);
  expect(body.climbs.at(-1)).toMatchObject({ id: 5999, name: "Big 4999" });
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toEqual(info);
});

it("aborts a failed upload and leaves the previous snapshot in place", async () => {
  await seedFixtureTree(db);
  const first = await runScheduledCatalogExport(env, NOW);
  await seedManyClimbs(db, 4, 3, 100);
  const { bucket, aborted } = observedBucket(1);

  const later = new Date("2026-09-21T06:00:00.000Z");
  await expect(writeCatalogExport(bucket, db, later)).rejects.toThrow("R2 hiccup");
  expect(aborted).toHaveLength(1);

  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toEqual(first);
  const body = JSON.parse(await (await env.CATALOG_EXPORTS.get(CATALOG_EXPORT_KEY))!.text());
  expect(body.generatedAt).toBe(NOW.toISOString());
  expect(body.climbs).toHaveLength(4);
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
  await writeCatalogExport(env.CATALOG_EXPORTS, db, NOW);
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
