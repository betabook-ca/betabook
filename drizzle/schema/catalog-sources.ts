import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { areas } from "./areas";
import { climbs } from "./climbs";

/** External route IDs and matching decisions survive later catalog imports.
 * Coordinates are source metadata and may identify a crag, not a route. */
export const catalogRouteSources = sqliteTable(
  "catalog_route_sources",
  {
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    climbId: integer("climb_id").references(() => climbs.id, { onDelete: "set null" }),
    sourceName: text("source_name").notNull(),
    sourceGrade: text("source_grade"),
    sourceType: text("source_type").notNull(),
    sourcePath: text("source_path").notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    status: text("status", { enum: ["matched", "new", "review", "unsupported"] }).notNull(),
    matchKind: text("match_kind"),
    matchScore: real("match_score"),
    release: text("release").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.sourceId] }),
    index("catalog_route_sources_climb_idx").on(table.climbId),
    index("catalog_route_sources_path_idx").on(table.source, table.sourcePath),
  ],
);

/** A source path points to the deepest safe Betabook anchor, when resolved.
 * The OpenBeta parquet path contains only its first five hierarchy tokens. */
export const catalogAreaSources = sqliteTable(
  "catalog_area_sources",
  {
    source: text("source").notNull(),
    sourcePath: text("source_path").notNull(),
    areaId: integer("area_id").references(() => areas.id, { onDelete: "set null" }),
    quality: text("quality").notNull(),
    release: text("release").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.sourcePath] }),
    index("catalog_area_sources_area_idx").on(table.areaId),
  ],
);
