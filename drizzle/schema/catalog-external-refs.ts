import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const CATALOG_ENTITY_TYPES = ["area", "climb"] as const;
export const CATALOG_MATCH_METHODS = ["exact", "fuzzy", "llm", "created"] as const;

// The crosswalk between an external catalog (currently only OpenBeta) and
// Betabook's own rows, written by scripts/openbeta-import/. betabookId
// targets areas or climbs according to entityType, so it cannot have a
// single foreign key — same reasoning as change_requests.entity_id. The
// unique (source, externalId) index is the whole point: a future re-sync
// looks up an already-linked row in one query instead of re-matching it.
export const catalogExternalRefs = sqliteTable(
  "catalog_external_refs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    entityType: text("entity_type", { enum: CATALOG_ENTITY_TYPES }).notNull(),
    betabookId: integer("betabook_id").notNull(),
    matchMethod: text("match_method", { enum: CATALOG_MATCH_METHODS }).notNull(),
    confidence: real("confidence"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex("catalog_external_refs_source_id_idx").on(t.source, t.externalId),
    index("catalog_external_refs_entity_idx").on(t.entityType, t.betabookId),
  ],
);
