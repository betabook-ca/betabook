// Phase 1: load a fast, in-memory read-only view of Betabook's current
// areas/climbs from a local D1 sqlite file, for blocking/matching without
// hammering remote D1 with per-candidate network round-trips across a
// catalog this size (see docs/openbeta-import-plan.md). Getting that file —
// `wrangler d1 export betabook-db --remote` for a real production run, or
// the existing `.wrangler` dev database for a local dry run (same file
// scripts/promote-admin.ts reads via d1-local.ts) — is the caller's job.
import { DatabaseSync } from "node:sqlite";

import type { BetabookAreaCandidate, BetabookClimbCandidate, Discipline } from "./types.ts";

export type AreaRow = {
  id: number;
  parent_id: number | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type ClimbRow = {
  id: number;
  area_id: number;
  name: string;
  type: Discipline;
  grade: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type Snapshot = {
  areas: BetabookAreaCandidate[];
  climbs: BetabookClimbCandidate[];
};

/** Builds root-first ancestor name lists for every area in one pass (memoized
 * per id) rather than a recursive SQL query per area — this snapshot can hold
 * 10,000+ areas, and a per-row recursive-CTE walk at that scale is exactly
 * the cost this offline pass exists to avoid paying against remote D1. */
export function buildAncestorPaths(rows: readonly AreaRow[]): Map<number, string[]> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const cache = new Map<number, string[]>();

  function ancestorsOf(id: number): string[] {
    const cached = cache.get(id);
    if (cached) return cached;
    const row = byId.get(id);
    const parent = row?.parent_id != null ? byId.get(row.parent_id) : undefined;
    const path = parent ? [...ancestorsOf(parent.id), parent.name] : [];
    cache.set(id, path);
    return path;
  }

  const result = new Map<number, string[]>();
  for (const row of rows) result.set(row.id, ancestorsOf(row.id));
  return result;
}

export function loadSnapshot(sqliteFilePath: string): Snapshot {
  const db = new DatabaseSync(sqliteFilePath, { readOnly: true });
  try {
    const areaRows = db
      .prepare(`SELECT id, parent_id, name, latitude, longitude FROM areas`)
      .all() as unknown as AreaRow[];
    const climbRows = db
      .prepare(`SELECT id, area_id, name, type, grade, latitude, longitude FROM climbs`)
      .all() as unknown as ClimbRow[];

    const ancestorPaths = buildAncestorPaths(areaRows);

    const areas: BetabookAreaCandidate[] = areaRows.map((row) => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      latitude: row.latitude,
      longitude: row.longitude,
      ancestors: ancestorPaths.get(row.id) ?? [],
    }));

    const climbs: BetabookClimbCandidate[] = climbRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      grade: row.grade,
      areaId: row.area_id,
      latitude: row.latitude,
      longitude: row.longitude,
    }));

    return { areas, climbs };
  } finally {
    db.close();
  }
}

/** Areas grouped by direct parent (null for roots) — the blocking unit Phase
 * 2 scans when resolving one OpenBeta area's children. */
export function indexAreasByParent(
  areas: readonly BetabookAreaCandidate[],
): Map<number | null, BetabookAreaCandidate[]> {
  const index = new Map<number | null, BetabookAreaCandidate[]>();
  for (const area of areas) {
    const list = index.get(area.parentId);
    if (list) list.push(area);
    else index.set(area.parentId, [area]);
  }
  return index;
}

/** Climbs grouped by area — the blocking unit Phase 3 scans once an OpenBeta
 * route's parent area has been resolved via the Phase 2 crosswalk. */
export function indexClimbsByArea(
  climbs: readonly BetabookClimbCandidate[],
): Map<number, BetabookClimbCandidate[]> {
  const index = new Map<number, BetabookClimbCandidate[]>();
  for (const climb of climbs) {
    const list = index.get(climb.areaId);
    if (list) list.push(climb);
    else index.set(climb.areaId, [climb]);
  }
  return index;
}

/** Rows already linked by an earlier run (or already present if the snapshot
 * itself was taken after a previous apply) — keyed by external uuid, so a
 * re-run or a resumed partial run can skip already-settled rows instead of
 * re-deciding or double-creating them. Only meaningful once
 * catalog_external_refs exists in the snapshotted database (migration
 * 0045+); returns an empty map against an older snapshot rather than
 * throwing. */
export function loadExistingCrosswalk(sqliteFilePath: string): Map<string, number> {
  const db = new DatabaseSync(sqliteFilePath, { readOnly: true });
  try {
    const tableExists = db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'catalog_external_refs'`,
      )
      .get();
    if (!tableExists) return new Map();

    const rows = db
      .prepare(
        `SELECT external_id, betabook_id FROM catalog_external_refs WHERE source = 'openbeta'`,
      )
      .all() as unknown as { external_id: string; betabook_id: number }[];
    return new Map(rows.map((row) => [row.external_id, row.betabook_id]));
  } finally {
    db.close();
  }
}
