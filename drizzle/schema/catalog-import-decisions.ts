import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";

export const CATALOG_IMPORT_DECISIONS = [
  "matched",
  "created",
  "merged_area",
  "merged_climb",
  "skipped",
] as const;
export const CATALOG_IMPORT_METHODS = ["exact", "fuzzy", "llm"] as const;

// The audit trail a fully-automated import needs in place of a pre-write
// human review queue: every decision the pipeline made, forensically
// reviewable after the fact, independent of change_requests (which bakes in
// a pending/approved/rejected human-approval lifecycle with reviewer/email
// plumbing that has no meaning for an unattended script run). Rows are
// written by scripts/openbeta-import/ alongside the data they explain, keyed
// by runId so one invocation's decisions can be reviewed together.
export const catalogImportDecisions = sqliteTable(
  "catalog_import_decisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    source: text("source").notNull(),
    sourceEntityType: text("source_entity_type", { enum: ["area", "climb"] }).notNull(),
    externalId: text("external_id").notNull(),
    decision: text("decision", { enum: CATALOG_IMPORT_DECISIONS }).notNull(),
    // Null only when decision is "skipped".
    betabookId: integer("betabook_id"),
    method: text("method", { enum: CATALOG_IMPORT_METHODS }).notNull(),
    confidence: real("confidence"),
    // JSON array of every candidate considered, not just the winner.
    candidateIds: text("candidate_ids").notNull(),
    // The LLM's own explanation, populated only when method is "llm".
    reasoning: text("reasoning"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    index("catalog_import_decisions_run_idx").on(t.runId),
    index("catalog_import_decisions_source_idx").on(t.source, t.externalId),
  ],
);
