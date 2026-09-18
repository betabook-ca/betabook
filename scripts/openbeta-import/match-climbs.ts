// Phase 3: climb reconciliation. Candidates are already narrowed to the
// route's resolved parent area (via the Phase 2 area crosswalk) — this
// module only narrows within that area's climbs. Mirrors the layered
// hard-filter-then-name-resolve shape lib/import-matching.ts uses for a
// user's tick-list import, adapted for catalog-vs-catalog matching: a
// discipline mismatch is a hard filter (disciplines never cross), a grade
// mismatch is only a soft tie-breaker (grades disagree across sources
// constantly and shouldn't block an otherwise-confident name match).
import { resolveByName } from "./name-resolve.ts";
import type { BetabookClimbCandidate, Discipline, MatchDecision } from "./types.ts";

/** `route`'s name is matched as-is — the caller has already resolved which
 * of the route's disciplines/grades to use (see grades.ts and parquet.ts for
 * routes that carry more than one). */
export function matchClimb(
  routeName: string,
  discipline: Discipline,
  grade: number | null,
  candidates: readonly BetabookClimbCandidate[],
): MatchDecision<BetabookClimbCandidate> {
  const sameDiscipline = candidates.filter((c) => c.type === discipline);
  if (sameDiscipline.length === 0) return { kind: "create" };

  const decision = resolveByName(routeName, sameDiscipline, (c) => c.name);
  if (decision.kind !== "ambiguous" || grade == null) return decision;

  const gradeMatches = decision.candidates.filter((c) => c.grade === grade);
  if (gradeMatches.length === 1) {
    return { kind: "match", candidate: gradeMatches[0], method: "fuzzy" };
  }
  return decision;
}
