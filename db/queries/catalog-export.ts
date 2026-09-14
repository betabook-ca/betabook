import { gt } from "drizzle-orm";

import type { Database } from "@/db/client";
import { areas, climbs } from "@/db/schema";
import type { ClimbType } from "@/lib/grades";

/** Public projection of an `areas` row, as in db/queries/public-catalog.ts. */
export type CatalogAreaRow = {
  id: number;
  parentId: number | null;
  name: string;
  description: string | null;
};

/** Public projection of a `climbs` row. The trigger-maintained aggregates
 * (`sendCount`, `ratingSum`, `ratingCount`, `avgRating`) are activity data and
 * stay out of every public payload (docs/repository-guide.md, "Routes and
 * metadata"). */
export type CatalogClimbRow = {
  id: number;
  areaId: number;
  name: string;
  type: ClimbType;
  grade: number | null;
  description: string | null;
};

/** Whole-table walkers for the weekly catalog export. Keyset on the primary
 * key rather than OFFSET: the export must reach every row however large the
 * catalog grows, and each page costs the same regardless of how deep it is. */
export async function getCatalogAreasAfter(
  db: Database,
  afterId: number,
  limit: number,
): Promise<CatalogAreaRow[]> {
  return db
    .select({
      id: areas.id,
      parentId: areas.parentId,
      name: areas.name,
      description: areas.description,
    })
    .from(areas)
    .where(gt(areas.id, afterId))
    .orderBy(areas.id)
    .limit(limit)
    .all();
}

export async function getCatalogClimbsAfter(
  db: Database,
  afterId: number,
  limit: number,
): Promise<CatalogClimbRow[]> {
  return db
    .select({
      id: climbs.id,
      areaId: climbs.areaId,
      name: climbs.name,
      type: climbs.type,
      grade: climbs.grade,
      description: climbs.description,
    })
    .from(climbs)
    .where(gt(climbs.id, afterId))
    .orderBy(climbs.id)
    .limit(limit)
    .all();
}
