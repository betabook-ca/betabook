import type { ClimbCandidate } from "@/db/queries";
import { formatGrade, parseGrade, type ClimbType } from "@/lib/grades";
import type { NormalizedImportRow } from "@/lib/sends-import";

/** Match SQLite LOWER(TRIM(name)): trim ASCII spaces and lowercase only ASCII
 * letters. JavaScript toLowerCase would also fold accented letters. */
export function foldClimbName(name: string): string {
  return name.replace(/^ +| +$/g, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
}

export type CandidateIndex = ReadonlyMap<string, ClimbCandidate[]>;

/** Deduplicate lookup names using the same fold key as SQLite. */
export function distinctClimbNames(rows: readonly NormalizedImportRow[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const key = foldClimbName(row.climbName);
    if (!byKey.has(key)) byKey.set(key, row.climbName);
  }
  return [...byKey.values()];
}

/** Build or extend the lookup index while preserving server order within each name. */
export function mergeCandidates(
  index: CandidateIndex,
  extra: readonly ClimbCandidate[],
): CandidateIndex {
  const merged = new Map(index);
  for (const candidate of extra) {
    const list = merged.get(candidate.key) ?? [];
    if (list.some((c) => c.id === candidate.id)) continue;
    merged.set(candidate.key, [...list, candidate]);
  }
  return merged;
}

function isTruncated(candidates: readonly ClimbCandidate[]): boolean {
  return candidates.length > 0 && candidates[0].total > candidates.length;
}

/** Uncapped name-and-area lookups recover matches omitted by the name-only cap. */
export function areaLookupsNeeded(
  rows: readonly NormalizedImportRow[],
  index: CandidateIndex,
): { name: string; areaName: string }[] {
  const seen = new Set<string>();
  const pairs: { name: string; areaName: string }[] = [];
  for (const row of rows) {
    if (!row.areaName) continue;
    const candidates = index.get(foldClimbName(row.climbName));
    if (!candidates || !isTruncated(candidates)) continue;
    const pairKey = `${foldClimbName(row.climbName)}\0${foldClimbName(row.areaName)}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    pairs.push({ name: row.climbName, areaName: row.areaName });
  }
  return pairs;
}

export type PreferredArea = { id: number; name: string };

export type MatchOptions = {
  gradeScale: "native" | "converted";
  preferredAreas: readonly PreferredArea[];
};

export type RowMatch =
  /** One candidate survives hard filters; notes may still request review. */
  | { kind: "exact"; climb: ClimbCandidate; notes: string[] }
  /** Soft signals resolve a same-name tie; reason identifies the deciding signal. */
  | { kind: "inferred"; climb: ClimbCandidate; reason: string; alternatives: ClimbCandidate[] }
  /** Offer candidates first; pool retains alternatives when filters conflict.
   * total counts matches before the server cap. */
  | {
      kind: "ambiguous";
      candidates: ClimbCandidate[];
      pool: ClimbCandidate[];
      total: number;
      truncated: boolean;
      conflict: string | null;
      narrowedBy: string | null;
    }
  | { kind: "none" };

/** Parse per discipline: V4 implies boulder, while 6a can match both
 * Font and French scales and cannot settle the discipline alone. */
export function impliedGrades(
  gradeText: string | null,
  scale: MatchOptions["gradeScale"],
): { boulder: number | null; rope: number | null } {
  if (!gradeText) return { boulder: null, rope: null };
  return {
    boulder: parseGrade("boulder", gradeText, scale),
    rope: parseGrade("sport", gradeText, scale),
  };
}

function impliedGradeFor(
  type: ClimbType,
  implied: { boulder: number | null; rope: number | null },
): number | null {
  return type === "boulder" ? implied.boulder : implied.rope;
}

function pathAreas(climb: ClimbCandidate): { id: number; name: string }[] {
  return [...climb.ancestors, { id: climb.areaId, name: climb.areaName }];
}

function inArea(climb: ClimbCandidate, areaName: string): boolean {
  const key = foldClimbName(areaName);
  return pathAreas(climb).some((area) => foldClimbName(area.name) === key);
}

function underAreas(climb: ClimbCandidate, areaIds: ReadonlySet<number>): boolean {
  return pathAreas(climb).some((area) => areaIds.has(area.id));
}

const TYPE_LABEL: Record<ClimbType, string> = { boulder: "boulder", sport: "sport", trad: "trad" };

/** "a", "a and b", "a, b, and c". */
function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}

function describeConflict(total: number, predicate: string, suffix = ""): string {
  return total === 1
    ? `The one climb with this name isn't ${predicate}${suffix}`
    : `None of the ${total} climbs with this name is ${predicate}${suffix}`;
}

/** Apply hard filters first; conflicts leave candidates available for manual selection.
 * Soft signals narrow ties only if candidates remain. A truncated list cannot
 * resolve automatically without an area-specific lookup confirming its candidates. */
// oxlint-disable-next-line complexity -- layered hard-then-soft signal filters, each a guarded branch
export function matchRow(
  row: NormalizedImportRow,
  index: CandidateIndex,
  options: MatchOptions,
): RowMatch {
  const all = index.get(foldClimbName(row.climbName)) ?? [];
  if (all.length === 0) return { kind: "none" };
  const total = all[0].total;
  const truncated = isTruncated(all);

  const ambiguous = (
    candidates: ClimbCandidate[],
    pool: ClimbCandidate[],
    conflict: string | null,
    narrowedBy: string | null = null,
  ): RowMatch => ({ kind: "ambiguous", candidates, pool, total, truncated, conflict, narrowedBy });

  let candidates = all;

  if (row.climbTypeHint) {
    const kept = candidates.filter((c) =>
      row.climbTypeHint === "route" ? c.type !== "boulder" : c.type === row.climbTypeHint,
    );
    if (kept.length === 0) {
      return ambiguous(
        candidates,
        all,
        describeConflict(
          total,
          `a ${row.climbTypeHint === "route" ? "route" : TYPE_LABEL[row.climbTypeHint]} climb`,
        ),
      );
    }
    candidates = kept;
  }

  const gradeText = row.postedGradeText ?? row.gradeText;
  const implied = impliedGrades(gradeText, options.gradeScale);
  const impliedType: "boulder" | "rope" | null =
    implied.boulder !== null && implied.rope === null
      ? "boulder"
      : implied.rope !== null && implied.boulder === null
        ? "rope"
        : null;
  if (impliedType) {
    const kept = candidates.filter((c) =>
      impliedType === "boulder" ? c.type === "boulder" : c.type !== "boulder",
    );
    if (kept.length === 0) {
      const noun = impliedType === "boulder" ? "boulder" : "route";
      return ambiguous(
        candidates,
        all,
        describeConflict(total, `a ${noun}`, `, but "${gradeText}" is a ${noun} grade`),
      );
    }
    candidates = kept;
  }

  const rowAreaName = row.areaName;
  if (rowAreaName) {
    const kept = candidates.filter((c) => inArea(c, rowAreaName));
    if (kept.length === 0) {
      return ambiguous(candidates, all, describeConflict(total, `in "${rowAreaName}"`));
    }
    candidates = kept;
  }

  const reliable = !truncated || row.areaName !== null;
  const preferredIds = new Set(options.preferredAreas.map((a) => a.id));

  if (candidates.length === 1 && reliable) {
    const climb = candidates[0];
    const notes: string[] = [];
    if (preferredIds.size > 0 && !underAreas(climb, preferredIds)) {
      notes.push("Not in one of your areas");
    }
    return { kind: "exact", climb, notes };
  }

  const pool = candidates;
  // Record reasons for narrowing steps even when a later step chooses the winner.
  const steps: { reason: (chosen: ClimbCandidate) => string; label: string }[] = [];
  const narrow = (
    keep: (c: ClimbCandidate) => boolean,
    reason: (chosen: ClimbCandidate) => string,
    label: string,
  ) => {
    const kept = candidates.filter(keep);
    if (kept.length > 0 && kept.length < candidates.length) {
      candidates = kept;
      steps.push({ reason, label });
    }
    return candidates.length === 1 && reliable;
  };
  const inferred = (): RowMatch => ({
    kind: "inferred",
    climb: candidates[0],
    reason: steps.map((step) => step.reason(candidates[0])).join("; "),
    alternatives: pool.filter((c) => c !== candidates[0]),
  });

  if (preferredIds.size > 0) {
    const done = narrow(
      (c) => underAreas(c, preferredIds),
      (chosen) => {
        const area = options.preferredAreas.find((a) => underAreas(chosen, new Set([a.id])));
        return area ? `in ${area.name}` : "in one of your areas";
      },
      "your areas",
    );
    if (done) return inferred();
  }

  for (const hint of row.areaHints) {
    if (
      narrow(
        (c) => inArea(c, hint),
        () => `matches "${hint}"`,
        `"${hint}"`,
      )
    )
      return inferred();
  }

  if (implied.boulder !== null || implied.rope !== null) {
    const done = narrow(
      (c) => c.grade !== null && c.grade === impliedGradeFor(c.type, implied),
      (chosen) => `the only ${formatGrade(chosen.type, chosen.grade)}`,
      `the grade "${gradeText}"`,
    );
    if (done) return inferred();
  }

  return ambiguous(
    candidates,
    pool,
    null,
    steps.length > 0 ? listWords(steps.map((step) => step.label)) : null,
  );
}

/** Cache automatic matches separately so manual picks do not rematch the whole file. */
export function matchRows(
  rows: readonly NormalizedImportRow[],
  index: CandidateIndex,
  options: MatchOptions,
): RowMatch[] {
  return rows.map((row) => matchRow(row, index, options));
}

export type ManualChoice = { kind: "pick"; climb: ClimbCandidate } | { kind: "skip" };

/** Both matched and review rows import; review marks a match that needs checking. */
export type ResolvedState = "matched" | "review" | "attention" | "picked" | "skipped";

export type ResolvedRow = {
  row: NormalizedImportRow;
  match: RowMatch;
  climb: ClimbCandidate | null;
  state: ResolvedState;
};

/** Manual choices override automatic matches for the same rows in the same order. */
export function resolveRows(
  rows: readonly NormalizedImportRow[],
  matches: readonly RowMatch[],
  manual: ReadonlyMap<number, ManualChoice>,
): ResolvedRow[] {
  return rows.map((row, i) => {
    const match = matches[i];
    const choice = manual.get(row.rowIndex);
    if (choice?.kind === "pick") return { row, match, climb: choice.climb, state: "picked" };
    if (choice?.kind === "skip") return { row, match, climb: null, state: "skipped" };
    switch (match.kind) {
      case "exact":
        return {
          row,
          match,
          climb: match.climb,
          state: match.notes.length > 0 ? "review" : "matched",
        };
      case "inferred":
        return { row, match, climb: match.climb, state: "review" };
      default:
        return { row, match, climb: null, state: "attention" };
    }
  });
}

export type ResolvedSummary = Record<ResolvedState, number> & {
  /** Unique climbs ready to import. */
  ready: number;
};

export function summarizeResolved(rows: readonly ResolvedRow[]): ResolvedSummary {
  const summary: ResolvedSummary = {
    matched: 0,
    review: 0,
    attention: 0,
    picked: 0,
    skipped: 0,
    ready: 0,
  };
  const climbs = new Set<number>();
  for (const resolved of rows) {
    summary[resolved.state] += 1;
    if (resolved.climb) climbs.add(resolved.climb.id);
  }
  summary.ready = climbs.size;
  return summary;
}

/** Map duplicate row indices to the first row for that climb; only the first imports. */
export function duplicateClimbRows(rows: readonly ResolvedRow[]): Map<number, NormalizedImportRow> {
  const firstByClimb = new Map<number, NormalizedImportRow>();
  const duplicates = new Map<number, NormalizedImportRow>();
  for (const resolved of rows) {
    if (!resolved.climb) continue;
    const first = firstByClimb.get(resolved.climb.id);
    if (first) duplicates.set(resolved.row.rowIndex, first);
    else firstByClimb.set(resolved.climb.id, resolved.row);
  }
  return duplicates;
}
