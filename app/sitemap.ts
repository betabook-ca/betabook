import type { MetadataRoute } from "next";
import { cache } from "react";

import { getDb } from "@/db/client";
import { countAreas, countClimbs, getAreaSitemapRows, getClimbSitemapRows } from "@/db/queries";
import { LANDING_PAGE_PATHS } from "@/lib/landing-pages";
import { SITE_URL } from "@/lib/site";
import { areaHref, climbHref } from "@/lib/slug";
import { TERMS_VERSIONS, termsHref } from "@/lib/terms";

// Google caps a sitemap at 50,000 URLs; stay under with headroom.
const SHARD_SIZE = 40_000;

// The valid `[id]` range Next pre-authorizes for the dynamic route below.
// `generateSitemaps` runs during `next build` (collecting page data) where
// CI's D1 has no schema, so it CANNOT touch the database — it returns this
// fixed range instead. 50 * 40k = 2M URLs of runway; `activeShardCount()`
// trims to real data at request time, so shards past the data are never
// linked and only return an empty urlset if hit directly.
const MAX_SHARDS = 50;

export const dynamic = "force-dynamic";

// "" (not "/") so the root entry is `https://betabook.ca`, matching the
// canonical link the home page renders.
const STATIC_PATHS = [
  "",
  ...LANDING_PAGE_PATHS,
  "/about",
  "/contact",
  "/terms",
  ...TERMS_VERSIONS.map(({ version }) => termsHref(version)),
];

const counts = cache(async () => {
  const db = await getDb();
  const [areas, climbs] = await Promise.all([countAreas(db), countClimbs(db)]);
  return { areas, climbs };
});

/** Real (non-empty) shard count from live row counts — area shards first
 * (static paths ride in shard 0), then climb shards. Request-time only: it
 * hits D1. The sitemap index links exactly this many shards. */
export async function activeShardCount(): Promise<number> {
  const { areas, climbs } = await counts();
  const areaShards = Math.max(1, Math.ceil(areas / SHARD_SIZE));
  const climbShards = Math.ceil(climbs / SHARD_SIZE);
  return areaShards + climbShards;
}

export function generateSitemaps() {
  return Array.from({ length: MAX_SHARDS }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const shard = Number(await id);
  if (!Number.isInteger(shard) || shard < 0 || shard >= (await activeShardCount())) return [];

  const db = await getDb();
  const { areas } = await counts();
  const areaShards = Math.max(1, Math.ceil(areas / SHARD_SIZE));

  if (shard < areaShards) {
    const rows = await getAreaSitemapRows(db, SHARD_SIZE, shard * SHARD_SIZE);
    const areaEntries = rows.map((a) => ({ url: `${SITE_URL}${areaHref(a.id, a.name)}` }));
    if (shard !== 0) return areaEntries;
    return [...STATIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` })), ...areaEntries];
  }

  const rows = await getClimbSitemapRows(db, SHARD_SIZE, (shard - areaShards) * SHARD_SIZE);
  return rows.map((c) => ({ url: `${SITE_URL}${climbHref(c.id, c.name)}` }));
}
