// Surfaces Betabook-internal duplicate areas: existing areas under the same
// parent whose names are exact, loose, or fuzzy duplicates of each other --
// independent of OpenBeta entirely. This is what actually resolves the
// pre-existing mess in production (docs/openbeta-import-plan.md's Context
// section: "Millennium"/"Millenium" and thousands of other siblings flatly
// dumped under area id 18, "Uncategorized"), not just OpenBeta-vs-Betabook
// matching. Output feeds renderAreaMerges (apply.ts) directly -- area_merge
// has no send/journal collision handling to reproduce, so it's safe to
// generate and apply automatically, unlike climb-level duplicates (see
// apply.ts's ClimbMergeCandidate comment).
// Bare Node.js does not resolve the app's @/ alias; share the fold helper directly.
// oxlint-disable-next-line import/no-relative-parent-imports
import { looseNameKey } from "../../lib/name-fold.ts";
import { resolveByName } from "./name-resolve.ts";
import type { BetabookAreaCandidate } from "./types.ts";

/** A full O(n^2) fuzzy sweep is only run within groups at or under this
 * size -- e.g. area 18 ("Uncategorized") alone has ~10,000 siblings, and
 * 10,000^2 pairwise Jaro-Winkler comparisons is not something to pay in a
 * general run. Larger groups still get the cheap exact/loose-key pass
 * below, which catches the exact-duplicate case ("Millennium" x2) in O(n);
 * a full fuzzy sweep over a group that large is a deliberately separate,
 * targeted cleanup pass, not part of this pipeline. */
const MAX_GROUP_SIZE_FOR_FUZZY_SWEEP = 500;

export type InternalAreaDuplicate = { sourceId: number; targetId: number };

/** Within one parent's children: groups by exact loose-name key first (O(n),
 * always run, regardless of group size), then fuzzy-compares each group's
 * representative against every other group's representative — catching a
 * near-miss like a lone "Millenium" against an already-clustered
 * "Millennium"/"millennium" pair — bounded by the number of *distinct*
 * loose-key groups, not raw sibling count. The lowest-id area within a group
 * survives as its representative/target; a fuzzy match between two groups'
 * representatives records one extra source->target edge from the absorbed
 * group's representative to the surviving one. Edges are recorded in
 * dependency order (a group's own members before it is itself absorbed into
 * another), which is exactly the order renderAreaMerges (apply.ts) needs:
 * applying merges in array order is always valid even for a two-step chain,
 * since the intermediate area still exists when its own members merge into
 * it and is only deleted afterward, when it merges into the next target. */
export function findDuplicatesAmongSiblings(
  siblings: readonly BetabookAreaCandidate[],
): InternalAreaDuplicate[] {
  if (siblings.length < 2) return [];

  const byLooseKey = new Map<string, BetabookAreaCandidate[]>();
  for (const area of siblings) {
    const key = looseNameKey(area.name);
    const group = byLooseKey.get(key);
    if (group) group.push(area);
    else byLooseKey.set(key, [area]);
  }

  const duplicates: InternalAreaDuplicate[] = [];
  const representatives: BetabookAreaCandidate[] = [];
  for (const group of byLooseKey.values()) {
    const [target, ...sources] = [...group].sort((a, b) => a.id - b.id);
    for (const source of sources) duplicates.push({ sourceId: source.id, targetId: target.id });
    representatives.push(target);
  }

  if (representatives.length > 1 && representatives.length <= MAX_GROUP_SIZE_FOR_FUZZY_SWEEP) {
    const sorted = [...representatives].sort((a, b) => a.id - b.id);
    const claimed = new Set<number>();
    for (let i = 0; i < sorted.length; i += 1) {
      if (claimed.has(sorted[i].id)) continue;
      for (let j = i + 1; j < sorted.length; j += 1) {
        if (claimed.has(sorted[j].id)) continue;
        const decision = resolveByName(sorted[i].name, [sorted[j]], (c) => c.name);
        if (decision.kind === "match") {
          duplicates.push({ sourceId: sorted[j].id, targetId: sorted[i].id });
          claimed.add(sorted[j].id);
        }
      }
    }
  }

  return duplicates;
}

export function findInternalAreaDuplicates(
  areasByParent: ReadonlyMap<number | null, BetabookAreaCandidate[]>,
): InternalAreaDuplicate[] {
  const duplicates: InternalAreaDuplicate[] = [];
  for (const siblings of areasByParent.values()) {
    duplicates.push(...findDuplicatesAmongSiblings(siblings));
  }
  return duplicates;
}
