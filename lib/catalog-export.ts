import { getCloudflareContext } from "@opennextjs/cloudflare";

import { createDb, type Database } from "@/db/client";
import {
  getCatalogAreasAfter,
  getCatalogClimbsAfter,
  type CatalogAreaRow,
  type CatalogClimbRow,
} from "@/db/queries/catalog-export";
import { formatGrade } from "@/lib/grades";

/** Weekly public snapshot of the catalog (areas + climbs) written to R2 by
 * the cron handler in worker.ts and served from /account. Everything in this
 * module takes its bindings explicitly: `scheduled()` runs outside OpenNext's
 * request context, so `getDb()`/`getCloudflareContext()` are unavailable
 * there. Only `getCatalogExportBucket` is request-path code.
 *
 * Do not import the db/queries barrel here — it reaches next/headers and
 * Better Auth, and wrangler bundles worker.ts outside Next. */

export const CATALOG_EXPORT_KEY = "catalog/latest.json";
export const CATALOG_EXPORT_SCHEMA_VERSION = 1;
/** Rows per D1 round trip. Well under D1's response-size limits at any
 * realistic description length, and enough that a 100k-climb catalog is
 * ~100 queries. Tests pass a smaller size to prove the cursor advances. */
const PAGE_SIZE = 1000;

type CatalogExportClimb = CatalogClimbRow & {
  /** Human-readable grade in the discipline's native scale (Hueco for
   * boulders, YDS for ropes); `grade` alone is an ordinal only this app
   * understands. */
  gradeLabel: string | null;
};
type CatalogExport = {
  schemaVersion: number;
  generatedAt: string;
  areas: CatalogAreaRow[];
  climbs: CatalogExportClimb[];
};

/** What /account shows without downloading the file: read back from the R2
 * object's custom metadata. */
export type CatalogExportInfo = {
  generatedAt: string;
  areaCount: number;
  climbCount: number;
  /** Object size in bytes. */
  size: number;
};

async function walk<T extends { id: number }>(
  page: (afterId: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  const rows: T[] = [];
  let afterId = 0;
  for (;;) {
    const batch = await page(afterId);
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
    const last = batch.at(-1);
    if (!last || last.id <= afterId) throw new Error("Catalog export cursor did not advance");
    afterId = last.id;
  }
}

export async function buildCatalogExport(
  db: Database,
  now: Date,
  pageSize = PAGE_SIZE,
): Promise<CatalogExport> {
  const [areas, climbRows] = await Promise.all([
    walk((afterId) => getCatalogAreasAfter(db, afterId, pageSize), pageSize),
    walk((afterId) => getCatalogClimbsAfter(db, afterId, pageSize), pageSize),
  ]);
  const climbs = climbRows.map((climb) => ({
    ...climb,
    gradeLabel: climb.grade === null ? null : formatGrade(climb.type, climb.grade),
  }));
  return {
    schemaVersion: CATALOG_EXPORT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    areas,
    climbs,
  };
}

export async function writeCatalogExport(
  bucket: R2Bucket,
  snapshot: CatalogExport,
): Promise<CatalogExportInfo> {
  const body = JSON.stringify(snapshot);
  const info = {
    generatedAt: snapshot.generatedAt,
    areaCount: snapshot.areas.length,
    climbCount: snapshot.climbs.length,
  };
  await bucket.put(CATALOG_EXPORT_KEY, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      generatedAt: info.generatedAt,
      areaCount: String(info.areaCount),
      climbCount: String(info.climbCount),
      schemaVersion: String(snapshot.schemaVersion),
    },
  });
  return { ...info, size: new TextEncoder().encode(body).byteLength };
}

/** The cron job. Bindings come straight from `env`; see the module comment. */
export async function runScheduledCatalogExport(
  env: Pick<CloudflareEnv, "DB" | "CATALOG_EXPORTS">,
  now: Date = new Date(),
): Promise<CatalogExportInfo> {
  try {
    const snapshot = await buildCatalogExport(createDb(env.DB), now);
    const info = await writeCatalogExport(env.CATALOG_EXPORTS, snapshot);
    // `warn` is the lowest level the repo's no-console rule allows.
    console.warn(
      `Catalog export written: ${info.areaCount} areas, ${info.climbCount} climbs, ${info.size} bytes`,
    );
    return info;
  } catch (error) {
    console.error("Catalog export failed", error);
    throw error;
  }
}

function parseCount(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** `null` until the first run has written an object (or if its metadata is
 * missing/unparseable — treated the same so the page never renders garbage). */
export async function getCatalogExportInfo(
  bucket: R2Bucket | undefined,
): Promise<CatalogExportInfo | null> {
  const head = bucket ? await bucket.head(CATALOG_EXPORT_KEY) : null;
  if (!head) return null;
  const metadata = head.customMetadata ?? {};
  const generatedAt = metadata.generatedAt;
  const areaCount = parseCount(metadata.areaCount);
  const climbCount = parseCount(metadata.climbCount);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) return null;
  if (areaCount === null || climbCount === null) return null;
  return { generatedAt, areaCount, climbCount, size: head.size };
}

/** Request-path accessor. Widened to `undefined` like lib/rate-limit.ts so a
 * Worker deployed ahead of the binding degrades to "no snapshot yet" rather
 * than throwing on /account. */
export async function getCatalogExportBucket(): Promise<R2Bucket | undefined> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket: R2Bucket | undefined = env.CATALOG_EXPORTS;
  if (!bucket) console.warn("CATALOG_EXPORTS is not bound — catalog export unavailable");
  return bucket;
}

/** `betabook-catalog-2026-09-14.json`; falls back to an undated name when
 * the object carries no usable timestamp. */
export function catalogExportFilename(generatedAt: string | undefined): string {
  const parsed = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (Number.isNaN(parsed)) return "betabook-catalog.json";
  return `betabook-catalog-${new Date(parsed).toISOString().slice(0, 10)}.json`;
}
