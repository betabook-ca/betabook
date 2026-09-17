import type { ClimbCandidate } from "@/db/queries";
import { isLoggableOnClimb } from "@/lib/broken-climbs";
import { formatGrade, parseGrade, type ClimbType } from "@/lib/grades";
import type { NormalizedImportRow } from "@/lib/sends-import";

/** Match SQLite LOWER(TRIM(name)): trim ASCII spaces and lowercase only ASCII
 * letters. JavaScript toLowerCase would also fold accented letters. */
export function foldClimbName(name: string): string {
  return name.replace(/^ +| +$/g, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const LEADING_LABEL = /^[^a-z0-9(]*(?:\([a-z0-9]{1,3}\))?[^a-z0-9]*/;
const LEADING_ARTICLE_KEY = /^(?:the|a|an) /;

/** Deliberately lossy, so it only ever confirms a signal: catalogs decorate
 * area names differently ("**Bouldering at Exit 38", "(g) Black Dyke"). */
export function looseNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/g, "")
    .replace(LEADING_LABEL, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^ | $/g, "")
    .replace(LEADING_ARTICLE_KEY, "");
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

/** A recovered list can hold several spellings at once, each with its own
 * server-side total, so both are summed per name rather than read off the
 * first candidate. */
function candidateTotals(candidates: readonly ClimbCandidate[]) {
  const counts = new Map<string, { total: number; held: number }>();
  for (const candidate of candidates) {
    const entry = counts.get(candidate.key) ?? { total: candidate.total, held: 0 };
    entry.held += 1;
    counts.set(candidate.key, entry);
  }
  let total = 0;
  let truncated = false;
  for (const { total: named, held } of counts.values()) {
    total += named;
    if (named > held) truncated = true;
  }
  return { total, truncated };
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
  /** Candidates found under a different spelling, keyed by the row's own fold
   * key. Only consulted when the name itself finds nothing. */
  looseIndex?: CandidateIndex;
};

const LEADING_ARTICLE = /^(?:the|a|an) +/i;
const MAX_NAME_VARIANTS = 8;
/** How many of a location path's most specific segments may confirm a name. */
const CONFIRMING_HINTS = 3;
/** Each name costs up to MAX_NAME_VARIANTS extra lookups, so recovery is
 * bounded; anything past it stays available through the manual search. */
const MAX_LOOSE_LOOKUP_NAMES = 500;

/** Variants keep the indexed name lookup rather than widening the query. */
export function climbNameVariants(name: string): string[] {
  const original = foldClimbName(name);
  const seen = new Set<string>([original]);
  const variants: string[] = [];
  const add = (value: string) => {
    const trimmed = value.replace(/ +/g, " ").replace(/^ | $/g, "");
    const key = foldClimbName(trimmed);
    if (!trimmed || seen.has(key) || variants.length >= MAX_NAME_VARIANTS) return;
    seen.add(key);
    variants.push(trimmed);
  };
  const stripped = name.replace(LEADING_ARTICLE, "");
  const bases = LEADING_ARTICLE.test(name) ? [name, stripped] : [name, `The ${name}`];
  for (const base of bases) {
    add(base);
    add(base.replace(/[\u2018\u2019\u02bc]/g, "'"));
    add(base.replace(/'/g, "\u2019"));
    add(base.replace(/['\u2018\u2019\u02bc,.!?]/g, ""));
    add(base.replace(/[-\u2013\u2014/]+/g, " "));
    add(base.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  }
  return variants;
}

export function looseLookupsNeeded(
  rows: readonly NormalizedImportRow[],
  index: CandidateIndex,
): { name: string; variants: string[] }[] {
  const seen = new Set<string>();
  const lookups: { name: string; variants: string[] }[] = [];
  for (const row of rows) {
    if (lookups.length >= MAX_LOOSE_LOOKUP_NAMES) break;
    const key = foldClimbName(row.climbName);
    if (seen.has(key) || (index.get(key)?.length ?? 0) > 0) continue;
    seen.add(key);
    const variants = climbNameVariants(row.climbName);
    if (variants.length > 0) lookups.push({ name: row.climbName, variants });
  }
  return lookups;
}

/** One spelling per fold key across every name, so a variant is asked for once. */
export function looseLookupNames(lookups: readonly { variants: string[] }[]): string[] {
  const byKey = new Map<string, string>();
  for (const lookup of lookups) {
    for (const variant of lookup.variants) {
      const key = foldClimbName(variant);
      if (!byKey.has(key)) byKey.set(key, variant);
    }
  }
  return [...byKey.values()];
}

/** Keyed by the row's own name, so matching stays keyed by what the file said.
 * Built once from every lookup, rather than merged per batch. */
export function buildLooseIndex(
  lookups: readonly { name: string; variants: string[] }[],
  found: readonly ClimbCandidate[],
): CandidateIndex {
  const byVariant = new Map<string, string[]>();
  for (const lookup of lookups) {
    const name = foldClimbName(lookup.name);
    for (const variant of lookup.variants) {
      const key = foldClimbName(variant);
      const names = byVariant.get(key);
      if (names) names.push(name);
      else byVariant.set(key, [name]);
    }
  }
  const index = new Map<string, ClimbCandidate[]>();
  for (const candidate of found) {
    for (const key of byVariant.get(candidate.key) ?? []) {
      const list = index.get(key);
      if (!list) index.set(key, [candidate]);
      else if (!list.some((c) => c.id === candidate.id)) list.push(candidate);
    }
  }
  return index;
}

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
  const key = looseNameKey(areaName);
  return key !== "" && pathAreas(climb).some((area) => looseNameKey(area.name) === key);
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

function describeConflict(total: number, subject: string, predicate: string, suffix = ""): string {
  return total === 1
    ? `The one climb ${subject} isn't ${predicate}${suffix}`
    : `None of the ${total} climbs ${subject} is ${predicate}${suffix}`;
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
  const key = foldClimbName(row.climbName);
  const named = index.get(key) ?? [];
  if (named.length > 0) return matchCandidates(row, named, options, false);
  const loose = options.looseIndex?.get(key) ?? [];
  if (loose.length === 0) return { kind: "none" };
  return matchCandidates(row, loose, options, true);
}

// oxlint-disable-next-line complexity -- layered hard-then-soft signal filters, each a guarded branch
function matchCandidates(
  row: NormalizedImportRow,
  all: ClimbCandidate[],
  options: MatchOptions,
  spellingDiffers: boolean,
): RowMatch {
  const { total, truncated } = candidateTotals(all);
  const subject = spellingDiffers ? "spelled like this" : "with this name";
  const conflict = (predicate: string, suffix = "") =>
    describeConflict(total, subject, predicate, suffix);

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
        conflict(
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
        conflict(`a ${noun}`, `, but "${gradeText}" is a ${noun} grade`),
      );
    }
    candidates = kept;
  }

  const rowAreaName = row.areaName;
  if (rowAreaName) {
    const kept = candidates.filter((c) => inArea(c, rowAreaName));
    if (kept.length === 0) {
      return ambiguous(candidates, all, conflict(`in "${rowAreaName}"`));
    }
    candidates = kept;
  }

  const reliable = !truncated || row.areaName !== null;
  const preferredIds = new Set(options.preferredAreas.map((a) => a.id));

  /** A different spelling is only trusted where a *specific* location agrees.
   * Hints arrive leaf first and a path's last segment is its state or country,
   * which would confirm almost anything; a chosen area can be that broad too. */
  const areaAgrees = (climb: ClimbCandidate) => {
    if (rowAreaName !== null) return inArea(climb, rowAreaName);
    const specific = row.areaHints.slice(
      0,
      Math.max(1, Math.min(CONFIRMING_HINTS, row.areaHints.length - 1)),
    );
    return specific.some((hint) => inArea(climb, hint));
  };
  const spelling = (climb: ClimbCandidate) => `"${row.climbName}" is spelled "${climb.name}" here`;
  const unconfirmed = (climb: ClimbCandidate) =>
    `No climb is named "${row.climbName}". "${climb.name}" is close, but nothing confirms the location`;

  if (candidates.length === 1 && reliable) {
    const climb = candidates[0];
    if (spellingDiffers) {
      return areaAgrees(climb)
        ? { kind: "inferred", climb, reason: spelling(climb), alternatives: [] }
        : ambiguous(candidates, all, unconfirmed(climb));
    }
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
  const inferred = (): RowMatch => {
    const climb = candidates[0];
    const reasons = steps.map((step) => step.reason(climb));
    if (spellingDiffers) {
      if (!areaAgrees(climb)) return ambiguous(candidates, pool, unconfirmed(climb));
      reasons.unshift(spelling(climb));
    }
    return {
      kind: "inferred",
      climb,
      reason: reasons.join("; "),
      alternatives: pool.filter((c) => c !== climb),
    };
  };

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
    spellingDiffers ? `No climb is named "${row.climbName}"; these are spelled similarly` : null,
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
  /** Set when the chosen climb is broken. A row dated before the break keeps
   * its climb and is flagged for review; any other row loses it and needs
   * attention, since the server (and the database) would refuse the send. */
  broken: { climb: ClimbCandidate; brokenOn: string; loggable: boolean } | null;
};

export function brokenClimbImportReason(brokenOn: string, dateSent: string | null): string {
  return dateSent === null
    ? `Climb broke on ${brokenOn}; undated ascents can't be logged on it`
    : `Climb broke on ${brokenOn}; this ascent is dated on or after it`;
}

/** Applies the broken-climb rule to whatever climb a row ended up with,
 * including a manual pick, so no choice can produce a row the commit refuses. */
function withBrokenRule(resolved: Omit<ResolvedRow, "broken">): ResolvedRow {
  const { climb, row } = resolved;
  if (!climb || climb.brokenOn === null) return { ...resolved, broken: null };
  const brokenOn = climb.brokenOn;
  if (isLoggableOnClimb(climb, row.dateSent)) {
    return {
      ...resolved,
      state: resolved.state === "matched" ? "review" : resolved.state,
      broken: { climb, brokenOn, loggable: true },
    };
  }
  return {
    ...resolved,
    climb: null,
    state: "attention",
    broken: { climb, brokenOn, loggable: false },
  };
}

/** Manual choices override automatic matches for the same rows in the same order. */
export function resolveRows(
  rows: readonly NormalizedImportRow[],
  matches: readonly RowMatch[],
  manual: ReadonlyMap<number, ManualChoice>,
): ResolvedRow[] {
  return rows.map((row, i) => {
    const match = matches[i];
    const choice = manual.get(row.rowIndex);
    if (choice?.kind === "pick") {
      return withBrokenRule({ row, match, climb: choice.climb, state: "picked" });
    }
    if (choice?.kind === "skip") return { row, match, climb: null, state: "skipped", broken: null };
    switch (match.kind) {
      case "exact":
        return withBrokenRule({
          row,
          match,
          climb: match.climb,
          state: match.notes.length > 0 ? "review" : "matched",
        });
      case "inferred":
        return withBrokenRule({ row, match, climb: match.climb, state: "review" });
      default:
        return { row, match, climb: null, state: "attention", broken: null };
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
