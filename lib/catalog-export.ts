import { getCloudflareContext } from "@opennextjs/cloudflare";

import { createDb, type Database } from "@/db/client";
import {
  getCatalogAreasAfter,
  getCatalogClimbsAfter,
  getCatalogCounts,
} from "@/db/queries/catalog-export";
import { formatGrade } from "@/lib/grades";

/** Weekly public snapshot of the catalog (areas + climbs) written to R2 by
 * the cron handler in worker.ts and served from /account. Everything in this
 * module takes its bindings explicitly: `scheduled()` runs outside OpenNext's
 * request context, so `getDb()`/`getCloudflareContext()` are unavailable
 * there. Only `getCatalogExportBucket` is request-path code.
 *
 * The snapshot is streamed: JSON text is produced one D1 page at a time and
 * uploaded as fixed-size multipart parts, so memory stays at one part plus
 * one page whatever the catalog's size. The Worker has 128 MB; a 300k-climb
 * document is tens of MB before the copies `JSON.stringify` and encoding
 * would add.
 *
 * Do not import the db/queries barrel here — it reaches next/headers and
 * Better Auth, and wrangler bundles worker.ts outside Next. */

export const CATALOG_EXPORT_KEY = "catalog/latest.json";
export const CATALOG_EXPORT_SCHEMA_VERSION = 1;
/** Rows per D1 round trip. Well under D1's response-size limits at any
 * realistic description length, and enough that a 300k-climb catalog is
 * ~300 queries. Tests pass a smaller size to prove the cursor advances. */
const PAGE_SIZE = 1000;
/** R2's multipart rule: every part but the last must be exactly this size,
 * and no smaller than 5 MiB. */
export const CATALOG_EXPORT_PART_SIZE = 5 * 1024 * 1024;

/** What /account shows without downloading the file: read back from the R2
 * object's custom metadata. */
export type CatalogExportInfo = {
  generatedAt: string;
  areaCount: number;
  climbCount: number;
  /** Object size in bytes. */
  size: number;
};

/** The subset of R2Bucket the writer needs; tests wrap the real binding to
 * inject part failures. */
export type CatalogExportBucket = Pick<R2Bucket, "createMultipartUpload">;

async function* jsonRows<T extends { id: number }>(
  page: (afterId: number) => Promise<T[]>,
  pageSize: number,
  encode: (row: T) => string,
): AsyncGenerator<string> {
  let afterId = 0;
  let first = true;
  for (;;) {
    const batch = await page(afterId);
    if (batch.length > 0) {
      yield (first ? "" : ",") + batch.map(encode).join(",");
      first = false;
    }
    if (batch.length < pageSize) return;
    const last = batch.at(-1);
    if (!last || last.id <= afterId) throw new Error("Catalog export cursor did not advance");
    afterId = last.id;
  }
}

/** The snapshot as JSON text, one chunk per D1 page. Concatenated, the chunks
 * are byte-for-byte what `JSON.stringify` of the whole document would be:
 * `{ schemaVersion, generatedAt, areas: [...], climbs: [...] }`, each climb
 * carrying `gradeLabel`, the grade in the discipline's native scale (Hueco
 * for boulders, YDS for ropes), since `grade` alone is an ordinal only this
 * app understands. */
export async function* catalogExportJson(
  db: Database,
  now: Date,
  pageSize = PAGE_SIZE,
): AsyncGenerator<string> {
  yield `{"schemaVersion":${CATALOG_EXPORT_SCHEMA_VERSION},"generatedAt":${JSON.stringify(now.toISOString())},"areas":[`;
  yield* jsonRows(
    (afterId) => getCatalogAreasAfter(db, afterId, pageSize),
    pageSize,
    (area) => JSON.stringify(area),
  );
  yield `],"climbs":[`;
  yield* jsonRows(
    (afterId) => getCatalogClimbsAfter(db, afterId, pageSize),
    pageSize,
    (climb) =>
      JSON.stringify({
        ...climb,
        gradeLabel: climb.grade === null ? null : formatGrade(climb.type, climb.grade),
      }),
  );
  yield "]}";
}

/** Re-cuts text chunks into byte parts of exactly `partSize`, then one
 * shorter part for whatever is left. Cuts fall anywhere, including inside a
 * multi-byte character: R2 joins parts byte-wise, so the object is still the
 * chunks' UTF-8 encoding. */
export async function* fixedSizeParts(
  chunks: AsyncIterable<string>,
  partSize: number,
): AsyncGenerator<Uint8Array> {
  if (!Number.isInteger(partSize) || partSize < 1) {
    throw new RangeError(`Part size must be a positive integer, got ${partSize}`);
  }
  const encoder = new TextEncoder();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  for await (const chunk of chunks) {
    const bytes = encoder.encode(chunk);
    if (bytes.length === 0) continue;
    pending.push(bytes);
    pendingBytes += bytes.length;
    while (pendingBytes >= partSize) {
      const part = new Uint8Array(partSize);
      const rest: Uint8Array[] = [];
      let filled = 0;
      for (const piece of pending) {
        const take = Math.min(piece.length, partSize - filled);
        if (take > 0) part.set(piece.subarray(0, take), filled);
        filled += take;
        if (take < piece.length) rest.push(piece.subarray(take));
      }
      pending = rest;
      pendingBytes -= partSize;
      yield part;
    }
  }
  if (pendingBytes > 0) {
    const tail = new Uint8Array(pendingBytes);
    let filled = 0;
    for (const piece of pending) {
      tail.set(piece, filled);
      filled += piece.length;
    }
    yield tail;
  }
}

/** Streams the snapshot into `CATALOG_EXPORT_KEY` as a multipart upload; the
 * previous object stays live until `complete` swaps it. The counts in the
 * metadata are read before the first page, because R2 fixes metadata when
 * the upload is created: a catalog write landing mid-export can leave the
 * file a row off the numbers /account shows. */
export async function writeCatalogExport(
  bucket: CatalogExportBucket,
  db: Database,
  now: Date,
  { pageSize = PAGE_SIZE, partSize = CATALOG_EXPORT_PART_SIZE } = {},
): Promise<CatalogExportInfo> {
  const generatedAt = now.toISOString();
  const counts = await getCatalogCounts(db);
  const upload = await bucket.createMultipartUpload(CATALOG_EXPORT_KEY, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      generatedAt,
      areaCount: String(counts.areaCount),
      climbCount: String(counts.climbCount),
      schemaVersion: String(CATALOG_EXPORT_SCHEMA_VERSION),
    },
  });
  let size = 0;
  try {
    const parts: R2UploadedPart[] = [];
    for await (const part of fixedSizeParts(catalogExportJson(db, now, pageSize), partSize)) {
      parts.push(await upload.uploadPart(parts.length + 1, part));
      size += part.byteLength;
    }
    await upload.complete(parts);
  } catch (error) {
    // Parts of an unfinished upload are stored, and billed, until it is
    // aborted. The original error is the one worth surfacing.
    await upload.abort().catch(() => undefined);
    throw error;
  }
  return { generatedAt, ...counts, size };
}

/** The cron job. Bindings come straight from `env`; see the module comment. */
export async function runScheduledCatalogExport(
  env: Pick<CloudflareEnv, "DB" | "CATALOG_EXPORTS">,
  now: Date = new Date(),
): Promise<CatalogExportInfo> {
  try {
    const info = await writeCatalogExport(env.CATALOG_EXPORTS, createDb(env.DB), now);
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
export async function getCatalogExportInfo(bucket: R2Bucket): Promise<CatalogExportInfo | null> {
  const head = await bucket.head(CATALOG_EXPORT_KEY);
  if (!head) return null;
  const metadata = head.customMetadata ?? {};
  const generatedAt = metadata.generatedAt;
  const areaCount = parseCount(metadata.areaCount);
  const climbCount = parseCount(metadata.climbCount);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) return null;
  if (areaCount === null || climbCount === null) return null;
  return { generatedAt, areaCount, climbCount, size: head.size };
}

/** Request-path accessor. */
export async function getCatalogExportBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.CATALOG_EXPORTS;
}

/** `betabook-catalog-2026-09-14.json`; falls back to an undated name when
 * the object carries no usable timestamp. */
export function catalogExportFilename(generatedAt: string | undefined): string {
  const parsed = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (Number.isNaN(parsed)) return "betabook-catalog.json";
  return `betabook-catalog-${new Date(parsed).toISOString().slice(0, 10)}.json`;
}
