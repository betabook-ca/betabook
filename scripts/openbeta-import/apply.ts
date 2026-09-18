// Phase 4: render pipeline decisions as plain, reviewable SQL rather than
// writing to remote D1 directly. The generated files are committed to the
// branch (see docs/openbeta-import-plan.md "Deployment: code vs. data") and
// applied later, as a separate manual step, via
// `wrangler d1 execute betabook-db --remote --file=<generated file>`.
//
// New areas/climbs resolve their parent via a subquery against
// catalog_external_refs keyed by the OpenBeta uuid, rather than tracking
// JS-side "temp ids" for not-yet-inserted rows: every area/climb decision
// (created OR matched) writes its crosswalk row immediately after settling
// the entity, so a later statement in the same file can always find a
// parent's real id — whether that parent already existed or was created
// earlier in this same run — with one uniform lookup. This requires area
// decisions to be rendered in topological (parent-before-child) order; the
// caller is responsible for that ordering (snapshot.ts's parent index makes
// a top-down walk straightforward).
import type { Discipline, MatchMethod } from "./types.ts";

export type ResolvedAreaDecision =
  | {
      kind: "match";
      externalId: string;
      betabookId: number;
      method: Exclude<MatchMethod, "created">;
      confidence: number | null;
      candidateIds: number[];
      reasoning: string | null;
    }
  | {
      kind: "create";
      externalId: string;
      name: string;
      /** OpenBeta uuid of the resolved parent, or null for a root-level
       * area (Betabook has none creatable today — see actions/areas.ts's
       * comment on createArea — so this should not occur in practice, but
       * the renderer doesn't assume it can't). */
      parentExternalId: string | null;
      latitude: number | null;
      longitude: number | null;
      /** Set only when this create followed arbitration over real
       * candidates (as opposed to the plain "no candidates at all" path) —
       * captures *why* the arbitrator declined to match, which is exactly
       * the record a human sanity-checking the run needs most. Undefined
       * leaves the audit row's reasoning/candidates null/empty, as before. */
      arbitration?: { confidence: number | null; reasoning: string; candidateIds: number[] };
    }
  | { kind: "skip"; externalId: string; reason: string; candidateIds: number[] };

export type ResolvedClimbDecision =
  | {
      kind: "match";
      externalId: string;
      betabookId: number;
      method: Exclude<MatchMethod, "created">;
      confidence: number | null;
      candidateIds: number[];
      reasoning: string | null;
    }
  | {
      kind: "create";
      externalId: string;
      name: string;
      type: Discipline;
      grade: number | null;
      parentAreaExternalId: string;
      latitude: number | null;
      longitude: number | null;
      /** See ResolvedAreaDecision's "create" variant — same purpose. */
      arbitration?: { confidence: number | null; reasoning: string; candidateIds: number[] };
    }
  | { kind: "skip"; externalId: string; reason: string; candidateIds: number[] };

/** Betabook-internal duplicate areas surfaced while matching against
 * OpenBeta (two existing areas resolving to the same external row). Simple
 * enough (reparent children, delete source, no collision handling) to
 * render safely as plain SQL, mirroring applyAreaMerge exactly. */
export type AreaMergeCandidate = { sourceBetabookId: number; targetBetabookId: number };

/** Betabook-internal duplicate climbs surfaced the same way. Deliberately
 * NOT auto-applied here: applyClimbMerge's send/journal collision handling
 * and broken-climb guards are load-bearing and already tested there — hand-
 * duplicating that logic as raw SQL text risks getting it wrong against real
 * user history, which is exactly the irreversible mistake this pipeline is
 * designed to avoid. These are written to the manifest as flagged candidates
 * for a human to apply through the existing in-app climb_merge action. */
export type ClimbMergeCandidate = {
  sourceBetabookId: number;
  targetBetabookId: number;
  reason: string;
};

/** Escapes quotes and strips newlines: chunkStatements below splits the
 * rendered SQL one statement per line, so a literal newline inside a value
 * (a name, or LLM reasoning text) would otherwise be misread as a statement
 * boundary. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''").replace(/[\r\n]+/g, " ")}'`;
}

function sqlStringOrNull(value: string | null): string {
  return value === null ? "NULL" : sqlString(value);
}

function sqlNumberOrNull(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

/** Every area/climb decision, matched or created, writes this immediately
 * after settling the entity so later statements (including a later decision
 * in the same file whose parent is this one) can resolve it by uuid. */
function crosswalkInsert(
  entityType: "area" | "climb",
  externalId: string,
  betabookIdExpr: string,
  method: MatchMethod,
  confidence: number | null,
): string {
  return (
    `INSERT INTO catalog_external_refs (source, external_id, entity_type, betabook_id, match_method, confidence) ` +
    `VALUES ('openbeta', ${sqlString(externalId)}, '${entityType}', ${betabookIdExpr}, ` +
    `'${method}', ${sqlNumberOrNull(confidence)});`
  );
}

function decisionAuditInsert(
  runId: string,
  entityType: "area" | "climb",
  externalId: string,
  decision: "matched" | "created" | "skipped",
  betabookIdExpr: string,
  method: MatchMethod,
  confidence: number | null,
  candidateIds: number[],
  reasoning: string | null,
): string {
  return (
    `INSERT INTO catalog_import_decisions ` +
    `(run_id, source, source_entity_type, external_id, decision, betabook_id, method, confidence, candidate_ids, reasoning) ` +
    `VALUES (${sqlString(runId)}, 'openbeta', '${entityType}', ${sqlString(externalId)}, '${decision}', ` +
    `${betabookIdExpr}, '${method}', ${sqlNumberOrNull(confidence)}, ${sqlString(JSON.stringify(candidateIds))}, ` +
    `${sqlStringOrNull(reasoning)});`
  );
}

/** A resolved parent's real id, whether it already existed or was created
 * earlier in this same run -- both cases already have a crosswalk row by
 * the time a child is rendered, given topological ordering. */
function parentIdSubquery(parentExternalId: string): string {
  return (
    `(SELECT betabook_id FROM catalog_external_refs ` +
    `WHERE source = 'openbeta' AND entity_type = 'area' AND external_id = ${sqlString(parentExternalId)})`
  );
}

/** This decision's own real id, resolved via the crosswalk row the same
 * statement group's crosswalkInsert just wrote. Used for the audit row
 * rather than a second `last_insert_rowid()` call: SQLite's
 * `last_insert_rowid()` reflects only the single most recent insert on the
 * connection, so calling it again after the crosswalk insert (a different
 * table, its own autoincrement id) would return the crosswalk row's own id,
 * not the area/climb's. */
function externalIdSubquery(entityType: "area" | "climb", externalId: string): string {
  return (
    `(SELECT betabook_id FROM catalog_external_refs ` +
    `WHERE source = 'openbeta' AND entity_type = '${entityType}' AND external_id = ${sqlString(externalId)})`
  );
}

/** One decision's statements, kept together as a unit: chunkStatements packs
 * whole groups into a file, never splitting one across two separate
 * `wrangler d1 execute` invocations, since a later statement in the group
 * (the crosswalk insert, resolved via `last_insert_rowid()`) depends on the
 * entity insert immediately preceding it in the same batch/connection. */
type StatementGroup = string[];

export function renderAreaDecisions(
  runId: string,
  decisions: readonly ResolvedAreaDecision[],
): StatementGroup[] {
  const groups: StatementGroup[] = [];
  for (const decision of decisions) {
    if (decision.kind === "match") {
      groups.push([
        `INSERT OR IGNORE INTO catalog_external_refs (source, external_id, entity_type, betabook_id, match_method, confidence) ` +
          `VALUES ('openbeta', ${sqlString(decision.externalId)}, 'area', ${decision.betabookId}, ` +
          `'${decision.method}', ${sqlNumberOrNull(decision.confidence)});`,
        decisionAuditInsert(
          runId,
          "area",
          decision.externalId,
          "matched",
          String(decision.betabookId),
          decision.method,
          decision.confidence,
          decision.candidateIds,
          decision.reasoning,
        ),
      ]);
    } else if (decision.kind === "create") {
      const parentIdExpr = decision.parentExternalId
        ? parentIdSubquery(decision.parentExternalId)
        : "NULL";
      groups.push([
        `INSERT INTO areas (parent_id, name, latitude, longitude) ` +
          `VALUES (${parentIdExpr}, ${sqlString(decision.name)}, ` +
          `${sqlNumberOrNull(decision.latitude)}, ${sqlNumberOrNull(decision.longitude)});`,
        crosswalkInsert(
          "area",
          decision.externalId,
          "last_insert_rowid()",
          "created",
          decision.arbitration?.confidence ?? null,
        ),
        decisionAuditInsert(
          runId,
          "area",
          decision.externalId,
          "created",
          externalIdSubquery("area", decision.externalId),
          "created",
          decision.arbitration?.confidence ?? null,
          decision.arbitration?.candidateIds ?? [],
          decision.arbitration?.reasoning ?? null,
        ),
      ]);
    } else {
      groups.push([
        decisionAuditInsert(
          runId,
          "area",
          decision.externalId,
          "skipped",
          "NULL",
          "created",
          null,
          decision.candidateIds,
          decision.reason,
        ),
      ]);
    }
  }
  return groups;
}

export function renderClimbDecisions(
  runId: string,
  decisions: readonly ResolvedClimbDecision[],
): StatementGroup[] {
  const groups: StatementGroup[] = [];
  for (const decision of decisions) {
    if (decision.kind === "match") {
      groups.push([
        `INSERT OR IGNORE INTO catalog_external_refs (source, external_id, entity_type, betabook_id, match_method, confidence) ` +
          `VALUES ('openbeta', ${sqlString(decision.externalId)}, 'climb', ${decision.betabookId}, ` +
          `'${decision.method}', ${sqlNumberOrNull(decision.confidence)});`,
        decisionAuditInsert(
          runId,
          "climb",
          decision.externalId,
          "matched",
          String(decision.betabookId),
          decision.method,
          decision.confidence,
          decision.candidateIds,
          decision.reasoning,
        ),
      ]);
    } else if (decision.kind === "create") {
      groups.push([
        `INSERT INTO climbs (area_id, name, type, grade, latitude, longitude) ` +
          `VALUES (${parentIdSubquery(decision.parentAreaExternalId)}, ${sqlString(decision.name)}, ` +
          `'${decision.type}', ${sqlNumberOrNull(decision.grade)}, ` +
          `${sqlNumberOrNull(decision.latitude)}, ${sqlNumberOrNull(decision.longitude)});`,
        crosswalkInsert(
          "climb",
          decision.externalId,
          "last_insert_rowid()",
          "created",
          decision.arbitration?.confidence ?? null,
        ),
        decisionAuditInsert(
          runId,
          "climb",
          decision.externalId,
          "created",
          externalIdSubquery("climb", decision.externalId),
          "created",
          decision.arbitration?.confidence ?? null,
          decision.arbitration?.candidateIds ?? [],
          decision.arbitration?.reasoning ?? null,
        ),
      ]);
    } else {
      groups.push([
        decisionAuditInsert(
          runId,
          "climb",
          decision.externalId,
          "skipped",
          "NULL",
          "created",
          null,
          decision.candidateIds,
          decision.reason,
        ),
      ]);
    }
  }
  return groups;
}

/** Mirrors applyAreaMerge's batch (actions/moderation-apply.ts) as plain SQL:
 * retarget the source's crosswalk rows (so a future re-sync doesn't treat a
 * since-deleted area as still linked), reparent child areas and climbs onto
 * the target, then delete the source. Safe to render directly because
 * area_merge, unlike climb_merge, has no send/journal collision handling to
 * reproduce. */
export function renderAreaMerges(candidates: readonly AreaMergeCandidate[]): StatementGroup[] {
  return candidates.map(({ sourceBetabookId, targetBetabookId }) => [
    `UPDATE catalog_external_refs SET betabook_id = ${targetBetabookId} ` +
      `WHERE entity_type = 'area' AND betabook_id = ${sourceBetabookId};`,
    `UPDATE areas SET parent_id = ${targetBetabookId} WHERE parent_id = ${sourceBetabookId};`,
    `UPDATE climbs SET area_id = ${targetBetabookId} WHERE area_id = ${sourceBetabookId};`,
    `DELETE FROM areas WHERE id = ${sourceBetabookId};`,
  ]);
}

/** Chunks statement groups into files of at most `maxStatements` statements
 * each, so no single `wrangler d1 execute --file` call exceeds D1's
 * (undocumented in this repo) batch limits — see docs/openbeta-import-plan.md
 * Phase 4: tune this empirically, don't trust a guessed number at full
 * scale. A group is never split across chunks: later statements in a group
 * (a crosswalk insert resolved via `last_insert_rowid()`) depend on the
 * statement immediately before them running in the same batch/connection, so
 * splitting one across two separately-applied files would corrupt it. */
export function chunkStatements(
  groups: readonly StatementGroup[],
  maxStatements: number,
): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  for (const group of groups) {
    if (current.length > 0 && current.length + group.length > maxStatements) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}
