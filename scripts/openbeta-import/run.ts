#!/usr/bin/env node
// CLI entrypoint for the OpenBeta catalog reconciliation pipeline. Wires
// Phases 0-4 together (docs/openbeta-import-plan.md). Only generates plain
// SQL files under output/<runId>/ — it never writes to remote D1 itself;
// applying the generated files is a separate, later, manual step (Phase 4b).
//
// Usage:
//   node --disable-warning=ExperimentalWarning scripts/openbeta-import/run.ts \
//     --climbs-parquet <path> --snapshot <path> \
//     [--output-dir <dir>] [--run-id <id>] [--model <model>] [--max-statements <n>]
//
//   node --disable-warning=ExperimentalWarning scripts/openbeta-import/run.ts \
//     --inspect-schema --climbs-parquet <path>
//
// One input file: the default OpenBeta parquet export has no separate
// area-entity file (see parquet.ts's top comment) — areas are synthesized
// from breadcrumb columns on the climbs file itself (breadcrumbs.ts).
// This file is not unit-tested, matching scripts/seed.ts and
// scripts/promote-admin.ts's own convention — its correctness rests on the
// modules it wires together, each tested independently, plus the dry-run/
// small-sample verification in docs/openbeta-import-plan.md's Rollout section.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import {
  chunkStatements,
  renderAreaDecisions,
  renderAreaMerges,
  renderClimbDecisions,
  type AreaMergeCandidate,
  type ClimbMergeCandidate,
  type ResolvedAreaDecision,
  type ResolvedClimbDecision,
} from "./apply.ts";
import { breadcrumbExternalId, synthesizeAreaNodes } from "./breadcrumbs.ts";
import { normalizeCountryName } from "./country-aliases.ts";
import { mapGradeToOrdinal } from "./grades.ts";
import { findInternalAreaDuplicates } from "./internal-duplicates.ts";
import {
  arbitrate,
  resolveArbitration,
  DEFAULT_ARBITRATION_MODEL,
  type ArbitrationCandidate,
  type ArbitrationDecision,
  type ArbitrationSubject,
} from "./llm-arbitrate.ts";
import { matchArea } from "./match-areas.ts";
import { matchClimb } from "./match-climbs.ts";
import { inspectParquetSchema, mapOpenBetaClimbRows, readParquetRows } from "./parquet.ts";
import {
  descendantsOf,
  indexAreasByParent,
  indexClimbsByArea,
  loadExistingCrosswalk,
  loadSnapshot,
} from "./snapshot.ts";
import type {
  BetabookAreaCandidate,
  BetabookClimbCandidate,
  Discipline,
  OpenBetaAreaRow,
  OpenBetaClimbRow,
} from "./types.ts";

const SUPPORTED_DISCIPLINES = new Set<Discipline>(["boulder", "sport", "trad"]);
const MAX_STATEMENTS_PER_FILE_DEFAULT = 300;

function parseArgs(argv: readonly string[]): Map<string, string | true> {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, true);
    }
  }
  return args;
}

function requireStringArg(args: Map<string, string | true>, key: string): string {
  const value = args.get(key);
  if (typeof value !== "string") throw new Error(`Missing required --${key} <path>`);
  return value;
}

/** Picks the first Betabook-supported discipline the route carries, mapping
 * OpenBeta's own discipline vocabulary (which may include values Betabook
 * has no bucket for — aid, ice, mixed, alpine) onto ours. A route whose
 * *only* disciplines are unsupported is the caller's job to skip. */
function resolvedDiscipline(disciplines: readonly string[]): Discipline | null {
  const normalized = new Set(disciplines.map((d) => d.toLowerCase()));
  if (normalized.has("boulder") || normalized.has("bouldering")) return "boulder";
  if (normalized.has("sport")) return "sport";
  if (normalized.has("trad")) return "trad";
  return null;
}

function firstGradeText(grades: Record<string, string>): string | null {
  return grades.yds ?? grades.vscale ?? grades.french ?? grades.font ?? grades.uiaa ?? null;
}

/** How many hops of `fullPath` (root-first names) lie strictly beyond the
 * matched anchor -- i.e. the extra depth between the anchor and this
 * candidate that the anchor's own match doesn't already vouch for.
 * `anchorDepth` is the anchor's own depth from Betabook's root; the
 * anchor's own full path has length `anchorDepth + 1`, so subtracting that
 * from `fullPath`'s length gives the extra hop count in one step. */
function depthBeyondAnchor(fullPath: readonly string[], anchorDepth: number): number {
  return Math.max(0, fullPath.length - (anchorDepth + 1));
}

/** A wide-fallback candidate (found by searching the anchor's whole subtree,
 * not just its direct children -- see resolveAreas'/resolveClimbs' own
 * comments) is only offered to the name matcher when its own extra depth
 * beyond the anchor doesn't exceed the OpenBeta row's own remaining
 * (not-yet-consumed) breadcrumb-token count -- capping how far into an
 * unrelated branch of a large subtree a same-named candidate could be
 * found, the risk exact-only matching alone doesn't rule out.
 *
 * Deliberately depth-only, not name-overlap: OpenBeta and Betabook
 * routinely use *different* names for an equivalent intermediate grouping
 * (Betabook's real "Kelowna" vs. OpenBeta's own "Okanagan" region label for
 * the same crags, confirmed in a real run) -- that mismatch is exactly why
 * the wide fallback exists, so requiring the intermediate names to overlap
 * would reject the legitimate deep matches it's for. The remaining
 * coincidental-collision risk (two unrelated real places sharing one exact
 * leaf name within the depth cap) is further guarded by resolveByName's own
 * "more than one exact match is ambiguous, never guessed" rule.
 *
 * Built once per anchor (not per row) and cached -- an anchor's subtree can
 * be tens of thousands of candidates (e.g. a whole matched country), and
 * every still-unmatched row would otherwise rescan the entire thing on its
 * own, an O(rows x subtree size) cost that's prohibitively slow at real
 * scale. Bucketing by depth turns each row's query into an O(1) map lookup
 * plus a cheap concat, no rescan. */
class AncestryDepthIndex<T> {
  private readonly byDepth = new Map<number, T[]>();

  public constructor(
    items: readonly T[],
    fullPathOf: (item: T) => readonly string[],
    anchorDepth: number,
  ) {
    for (const item of items) {
      const depth = depthBeyondAnchor(fullPathOf(item), anchorDepth);
      const list = this.byDepth.get(depth);
      if (list) list.push(item);
      else this.byDepth.set(depth, [item]);
    }
  }

  /** Every indexed candidate at or within `maxDepth` hops beyond the anchor. */
  public query(maxDepth: number): T[] {
    const result: T[] = [];
    for (const [depth, items] of this.byDepth) {
      if (depth <= maxDepth) result.push(...items);
    }
    return result;
  }
}

/** Arbitrates normally when a real client is available; otherwise skips the
 * network call entirely and defaults to CREATE_NEW (via resolveArbitration's
 * existing UNCERTAIN handling, unchanged) with the count and reason recorded
 * for the audit trail. Extends the pipeline's own existing safety policy — a
 * missed dedup is cheap to fix later via area_merge/climb_merge, a wrong
 * merge is not — to the case where no ANTHROPIC_API_KEY is available at all,
 * rather than requiring every ambiguous case to be reasoned through by hand. */
async function arbitrateOrOfflineDefault(
  client: Anthropic | null,
  subject: ArbitrationSubject,
  candidates: readonly ArbitrationCandidate[],
  model: string,
): Promise<ArbitrationDecision> {
  if (!client) {
    return {
      action: "UNCERTAIN",
      reasoning:
        `No ANTHROPIC_API_KEY available this run; ${candidates.length} ambiguous candidate(s) ` +
        `for "${subject.name}" defaulted to create per project policy (a missed dedup is cheap ` +
        `to fix later via area_merge/climb_merge; a wrong merge is not).`,
    };
  }
  return arbitrate(client, subject, candidates, model);
}

type PendingAreaResolution =
  | {
      status: "matched";
      betabookId: number;
      nearestMatchedAncestorId: number;
      /** How many OpenBeta breadcrumb levels (this row's own pathTokens
       * plus itself) are "consumed" by this match -- lets a descendant's
       * wide-fallback search know how many of ITS OWN pathTokens are
       * already accounted for by this anchor, vs. still unverified. */
      nearestMatchedAncestorPathDepth: number;
    }
  | {
      status: "created";
      nearestMatchedAncestorId: number | null;
      nearestMatchedAncestorPathDepth: number;
    };

/** Walks OpenBeta areas top-down by parentUuid (roots first), resolving each
 * against the snapshot's existing areas (blocked to the already-resolved
 * parent's own children) or creating it, arbitrating via LLM whatever
 * deterministic matching leaves ambiguous. Returns per-area decisions plus
 * the externalId -> resolution map climbs need to attach to. */
async function resolveAreas(
  client: Anthropic | null,
  model: string,
  areaRows: readonly OpenBetaAreaRow[],
  areasByParent: Map<number | null, BetabookAreaCandidate[]>,
  // Betabook nests countries two levels deep (continent -> country), while
  // OpenBeta's breadcrumb has no continent level at all -- a root-level
  // (parentUuid === null) OpenBeta row is a *country*, so it must be blocked
  // against Betabook's country-level areas (every area one level under a
  // continent root), never against Betabook's true roots (the continents
  // themselves, which an OpenBeta row can never legitimately match).
  countryLevelAreas: readonly BetabookAreaCandidate[],
  alreadyLinked: ReadonlyMap<string, number>,
): Promise<{ decisions: ResolvedAreaDecision[]; resolved: Map<string, PendingAreaResolution> }> {
  const childrenByParent = new Map<string | null, OpenBetaAreaRow[]>();
  for (const row of areaRows) {
    const list = childrenByParent.get(row.parentUuid);
    if (list) list.push(row);
    else childrenByParent.set(row.parentUuid, [row]);
  }

  const decisions: ResolvedAreaDecision[] = [];
  const resolved = new Map<string, PendingAreaResolution>();
  // Memoized per nearest-matched-ancestor id -- the same anchor (e.g. a whole
  // matched country) is reused across many rows, and building the index is
  // proportional to that ancestor's subtree size (see AncestryDepthIndex's
  // own comment for why this must be cached rather than rebuilt per row).
  const ancestryIndexCache = new Map<number, AncestryDepthIndex<BetabookAreaCandidate>>();
  function cachedAncestryIndex(
    ancestorId: number,
    anchorDepth: number,
  ): AncestryDepthIndex<BetabookAreaCandidate> {
    const cached = ancestryIndexCache.get(ancestorId);
    if (cached) return cached;
    const result = new AncestryDepthIndex(
      descendantsOf(ancestorId, areasByParent),
      (c) => c.ancestors,
      anchorDepth,
    );
    ancestryIndexCache.set(ancestorId, result);
    return result;
  }
  // The anchor's own depth is needed to build its index (above).
  const areaById = new Map<number, BetabookAreaCandidate>();
  for (const list of areasByParent.values()) {
    for (const area of list) areaById.set(area.id, area);
  }

  async function resolveOne(row: OpenBetaAreaRow): Promise<void> {
    const alreadyLinkedId = alreadyLinked.get(row.uuid);
    if (alreadyLinkedId !== undefined) {
      resolved.set(row.uuid, {
        status: "matched",
        betabookId: alreadyLinkedId,
        nearestMatchedAncestorId: alreadyLinkedId,
        nearestMatchedAncestorPathDepth: row.pathTokens.length + 1,
      });
      return;
    }

    const { parentUuid } = row;
    const isRoot = parentUuid === null;
    const resolvedParent = parentUuid === null ? null : resolved.get(parentUuid);
    const nearestMatchedAncestorId = isRoot
      ? null
      : (resolvedParent?.nearestMatchedAncestorId ?? null);
    const nearestMatchedAncestorPathDepth = resolvedParent?.nearestMatchedAncestorPathDepth ?? 0;
    const directChildren =
      resolvedParent?.status === "matched"
        ? (areasByParent.get(resolvedParent.betabookId) ?? [])
        : [];

    // Country-name spelling conventions vary too widely for pure fuzzy
    // matching (see country-aliases.ts) -- normalize only for the match
    // attempt, never for what a "create" decision actually names the area.
    const matchSubject = isRoot ? { ...row, areaName: normalizeCountryName(row.areaName) } : row;

    const decision = isRoot
      ? countryLevelAreas.length === 0
        ? { kind: "create" as const }
        : matchArea(matchSubject, countryLevelAreas)
      : (() => {
          const direct =
            directChildren.length === 0
              ? { kind: "create" as const }
              : matchArea(matchSubject, directChildren);
          // OpenBeta's breadcrumb is a fixed 5 levels while Betabook's real
          // tree isn't that shape -- a plain "create" among the literal
          // direct children doesn't distinguish "genuinely doesn't exist in
          // Betabook" from "exists, just not as a child of this specific
          // resolved node." Whenever the narrow search doesn't land on a
          // match (empty candidates, or a real "no" among the siblings that
          // do exist), fall back to searching the nearest real ancestor's
          // full descendant subtree before giving up. A genuine ambiguous
          // tie among the literal direct children, though, is left as-is --
          // that's exactly what arbitration is for at this precise point in
          // the tree, not a reason to widen the search further. The wide
          // search itself is exact/loose-only (no fuzzy): confirmed via a
          // real run that fuzzy matching across a large, structurally-
          // uncorrelated subtree produces false positives a true-sibling
          // search wouldn't (e.g. OpenBeta's "Okanagan" region grouping
          // fuzzy-matching Betabook's unrelated "Okanagan Falls" crag) --
          // exact name equality is a far safer signal once structural
          // adjacency (direct parent/child) is no longer vouching for it --
          // but even an exact name can coincidentally collide between two
          // unrelated real places somewhere in a large subtree, so a
          // candidate is only offered to matchArea when its own extra depth
          // beyond the anchor is within this row's own remaining breadcrumb
          // depth (see AncestryDepthIndex's own comment).
          if (direct.kind !== "create" || nearestMatchedAncestorId === null) return direct;
          const anchorDepth = areaById.get(nearestMatchedAncestorId)?.ancestors.length ?? 0;
          const remainingDepth = Math.max(
            0,
            row.pathTokens.length - nearestMatchedAncestorPathDepth,
          );
          const wideCandidates = cachedAncestryIndex(nearestMatchedAncestorId, anchorDepth).query(
            remainingDepth,
          );
          return wideCandidates.length === 0
            ? direct
            : matchArea(matchSubject, wideCandidates, { allowFuzzy: false });
        })();

    if (decision.kind === "match") {
      decisions.push({
        kind: "match",
        externalId: row.uuid,
        betabookId: decision.candidate.id,
        method: decision.method,
        confidence: null,
        candidateIds: [decision.candidate.id],
        reasoning: null,
      });
      resolved.set(row.uuid, {
        status: "matched",
        betabookId: decision.candidate.id,
        nearestMatchedAncestorId: decision.candidate.id,
        nearestMatchedAncestorPathDepth: row.pathTokens.length + 1,
      });
    } else if (decision.kind === "create") {
      decisions.push({
        kind: "create",
        externalId: row.uuid,
        name: row.areaName,
        parentExternalId: row.parentUuid,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      resolved.set(row.uuid, {
        status: "created",
        nearestMatchedAncestorId,
        nearestMatchedAncestorPathDepth,
      });
    } else {
      const outcome = resolveArbitration(
        await arbitrateOrOfflineDefault(
          client,
          {
            entityType: "area",
            name: row.areaName,
            path: row.pathTokens,
            discipline: null,
            grade: null,
            coordinates:
              row.latitude != null && row.longitude != null
                ? { latitude: row.latitude, longitude: row.longitude }
                : null,
          },
          decision.candidates.map((c) => ({
            id: c.id,
            name: c.name,
            path: [...c.ancestors],
            grade: null,
            coordinates:
              c.latitude != null && c.longitude != null
                ? { latitude: c.latitude, longitude: c.longitude }
                : null,
          })),
          model,
        ),
        decision.candidates.map((c) => c.id),
      );
      if (outcome.kind === "match") {
        decisions.push({
          kind: "match",
          externalId: row.uuid,
          betabookId: outcome.candidateId,
          method: "llm",
          confidence: outcome.confidence,
          candidateIds: decision.candidates.map((c) => c.id),
          reasoning: outcome.reasoning,
        });
        resolved.set(row.uuid, {
          status: "matched",
          betabookId: outcome.candidateId,
          nearestMatchedAncestorId: outcome.candidateId,
          nearestMatchedAncestorPathDepth: row.pathTokens.length + 1,
        });
      } else {
        decisions.push({
          kind: "create",
          externalId: row.uuid,
          name: row.areaName,
          parentExternalId: row.parentUuid,
          latitude: row.latitude,
          longitude: row.longitude,
          arbitration: {
            confidence: outcome.confidence,
            reasoning: outcome.reasoning,
            candidateIds: decision.candidates.map((c) => c.id),
          },
        });
        resolved.set(row.uuid, {
          status: "created",
          nearestMatchedAncestorId,
          nearestMatchedAncestorPathDepth,
        });
      }
    }
  }

  // Roots first, then each level once its parent has settled — a plain
  // breadth-first walk over childrenByParent gives that ordering for free.
  const queue: (string | null)[] = [null];
  const seenLevels = new Set<string | null>();
  while (queue.length > 0) {
    const parentUuid = queue.shift() as string | null;
    if (seenLevels.has(parentUuid)) continue;
    seenLevels.add(parentUuid);
    const level = childrenByParent.get(parentUuid) ?? [];
    for (const row of level) {
      await resolveOne(row);
      queue.push(row.uuid);
    }
  }

  // A row whose declared parentUuid never appears in childrenByParent's keys
  // (i.e. isn't itself a row in this file) is unreachable by the walk above
  // and is silently absent from `resolved` — surfaced indirectly when its
  // own children (if any) fail to resolve a parent and get skipped below,
  // rather than treated as a special case here.

  return { decisions, resolved };
}

async function resolveClimbs(
  client: Anthropic | null,
  model: string,
  climbRows: readonly OpenBetaClimbRow[],
  resolvedAreas: ReadonlyMap<string, PendingAreaResolution>,
  areasByParent: Map<number | null, BetabookAreaCandidate[]>,
  climbsByArea: Map<number, BetabookClimbCandidate[]>,
  alreadyLinked: ReadonlyMap<string, number>,
): Promise<ResolvedClimbDecision[]> {
  const decisions: ResolvedClimbDecision[] = [];
  const areaById = new Map<number, BetabookAreaCandidate>();
  for (const list of areasByParent.values()) {
    for (const area of list) areaById.set(area.id, area);
  }
  // Same shape as resolveAreas's index cache: memoized per ancestor id since
  // many routes share the same nearest-matched-ancestor area, and building
  // the index is proportional to that ancestor's subtree size (see
  // AncestryDepthIndex's own comment).
  const ancestryIndexCache = new Map<number, AncestryDepthIndex<BetabookClimbCandidate>>();
  function cachedAncestryIndex(
    ancestorId: number,
    anchorDepth: number,
  ): AncestryDepthIndex<BetabookClimbCandidate> {
    const cached = ancestryIndexCache.get(ancestorId);
    if (cached) return cached;
    const areaIds = [ancestorId, ...descendantsOf(ancestorId, areasByParent).map((a) => a.id)];
    const climbs = areaIds.flatMap((id) => climbsByArea.get(id) ?? []);
    // A route's own breadcrumb has no separate "own name" excluded from it
    // the way an area's pathTokens does (the route's own name isn't part of
    // the breadcrumb at all -- the deepest breadcrumb token, the crag, is
    // the parent AREA's own name), so the comparison includes the
    // candidate's area's own name, not just its ancestors.
    const result = new AncestryDepthIndex(
      climbs,
      (c) => {
        const area = areaById.get(c.areaId);
        return area ? [...area.ancestors, area.name] : [];
      },
      anchorDepth,
    );
    ancestryIndexCache.set(ancestorId, result);
    return result;
  }

  for (const route of climbRows) {
    const alreadyLinkedId = alreadyLinked.get(route.uuid);
    if (alreadyLinkedId !== undefined) continue; // already settled by a prior run

    const discipline = resolvedDiscipline(route.disciplines);
    if (!discipline || !SUPPORTED_DISCIPLINES.has(discipline)) {
      decisions.push({
        kind: "skip",
        externalId: route.uuid,
        reason: `no Betabook-supported discipline among [${route.disciplines.join(", ")}]`,
        candidateIds: [],
      });
      continue;
    }

    const parentAreaExternalId = breadcrumbExternalId(route.breadcrumb);
    const parent = resolvedAreas.get(parentAreaExternalId);
    if (!parent) {
      decisions.push({
        kind: "skip",
        externalId: route.uuid,
        reason: `parent area ${parentAreaExternalId} was not resolved`,
        candidateIds: [],
      });
      continue;
    }

    const gradeText = firstGradeText(route.grades);
    const { grade } = mapGradeToOrdinal(discipline, gradeText);

    const directCandidates =
      parent.status === "matched" ? (climbsByArea.get(parent.betabookId) ?? []) : [];
    const direct =
      directCandidates.length === 0
        ? { kind: "create" as const }
        : matchClimb(route.name, discipline, grade, directCandidates);
    // Mirrors resolveAreas's fallback: a route's exact resolved crag-level
    // area may not itself exist in Betabook even when a broader ancestor
    // does (the same breadcrumb-depth mismatch, one level down) -- when the
    // narrow search comes up empty, widen to every climb anywhere under the
    // nearest matched ancestor's subtree, exact/loose name tiers only, and
    // (mirroring resolveAreas's own ancestry check) only among candidates
    // whose own area sits within the route's own remaining breadcrumb depth.
    const decision =
      direct.kind !== "create" || parent.nearestMatchedAncestorId === null
        ? direct
        : (() => {
            const anchorDepth =
              areaById.get(parent.nearestMatchedAncestorId)?.ancestors.length ?? 0;
            const remainingDepth = Math.max(
              0,
              route.breadcrumb.length - parent.nearestMatchedAncestorPathDepth,
            );
            const wideCandidates = cachedAncestryIndex(
              parent.nearestMatchedAncestorId,
              anchorDepth,
            ).query(remainingDepth);
            return wideCandidates.length === 0
              ? direct
              : matchClimb(route.name, discipline, grade, wideCandidates, { allowFuzzy: false });
          })();

    if (decision.kind === "match") {
      decisions.push({
        kind: "match",
        externalId: route.uuid,
        betabookId: decision.candidate.id,
        method: decision.method,
        confidence: null,
        candidateIds: [decision.candidate.id],
        reasoning: null,
      });
    } else if (decision.kind === "create") {
      decisions.push({
        kind: "create",
        externalId: route.uuid,
        name: route.name,
        type: discipline,
        grade,
        parentAreaExternalId,
        latitude: route.latitude,
        longitude: route.longitude,
      });
    } else {
      const outcome = resolveArbitration(
        await arbitrateOrOfflineDefault(
          client,
          {
            entityType: "climb",
            name: route.name,
            path: route.breadcrumb,
            discipline,
            grade: gradeText,
            coordinates:
              route.latitude != null && route.longitude != null
                ? { latitude: route.latitude, longitude: route.longitude }
                : null,
          },
          decision.candidates.map((c) => ({
            id: c.id,
            name: c.name,
            path: [],
            grade: gradeText,
            coordinates:
              c.latitude != null && c.longitude != null
                ? { latitude: c.latitude, longitude: c.longitude }
                : null,
          })),
          model,
        ),
        decision.candidates.map((c) => c.id),
      );
      if (outcome.kind === "match") {
        decisions.push({
          kind: "match",
          externalId: route.uuid,
          betabookId: outcome.candidateId,
          method: "llm",
          confidence: outcome.confidence,
          candidateIds: decision.candidates.map((c) => c.id),
          reasoning: outcome.reasoning,
        });
      } else {
        decisions.push({
          kind: "create",
          externalId: route.uuid,
          name: route.name,
          type: discipline,
          grade,
          parentAreaExternalId,
          latitude: route.latitude,
          longitude: route.longitude,
          arbitration: {
            confidence: outcome.confidence,
            reasoning: outcome.reasoning,
            candidateIds: decision.candidates.map((c) => c.id),
          },
        });
      }
    }
  }

  return decisions;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.get("inspect-schema")) {
    const climbsPath = requireStringArg(args, "climbs-parquet");
    console.log("columns:", await inspectParquetSchema(climbsPath));
    return;
  }

  const climbsParquetPath = requireStringArg(args, "climbs-parquet");
  const snapshotPath = requireStringArg(args, "snapshot");
  const outputDir =
    (args.get("output-dir") as string | undefined) ?? path.join(import.meta.dirname, "output");
  const runId = (args.get("run-id") as string | undefined) ?? randomUUID();
  const model = (args.get("model") as string | undefined) ?? DEFAULT_ARBITRATION_MODEL;
  const maxStatementsRaw = args.get("max-statements");
  const maxStatements =
    maxStatementsRaw === undefined ? MAX_STATEMENTS_PER_FILE_DEFAULT : Number(maxStatementsRaw);
  if (!Number.isInteger(maxStatements) || maxStatements <= 0) {
    // Number(NaN) would otherwise make chunkStatements's loop run once and
    // slice with NaN bounds, silently writing empty SQL files while main()
    // still reports success -- a typo'd flag would discard every decision.
    throw new Error(`--max-statements must be a positive integer, got ${String(maxStatementsRaw)}`);
  }

  console.log(`Run ${runId}: reading the parquet file...`);
  const { rows: climbRows, skipped: skippedClimbRows } = mapOpenBetaClimbRows(
    await readParquetRows(climbsParquetPath),
  );
  // This export carries no area-entity rows of its own (see parquet.ts's top
  // comment) — areas are synthesized from every route's breadcrumb prefix.
  const areaRows = synthesizeAreaNodes(climbRows.map((route) => route.breadcrumb));
  console.log(
    `Mapped ${climbRows.length} climbs (${skippedClimbRows.length} skipped), ` +
      `synthesized ${areaRows.length} area nodes from their breadcrumbs.`,
  );

  console.log("Loading Betabook snapshot...");
  const snapshot = loadSnapshot(snapshotPath);
  const areasByParent = indexAreasByParent(snapshot.areas);
  const countryLevelAreas = snapshot.areas.filter((area) => area.ancestors.length === 1);
  const climbsByArea = indexClimbsByArea(snapshot.climbs);
  const alreadyLinked = loadExistingCrosswalk(snapshotPath);

  // oxlint-disable-next-line node/no-process-env
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  if (!client) {
    console.warn(
      "No ANTHROPIC_API_KEY set -- ambiguous cases will default to create with a recorded " +
        "reason instead of being arbitrated by Claude (see arbitrateOrOfflineDefault).",
    );
  }

  console.log("Resolving areas...");
  const { decisions: areaDecisions, resolved: resolvedAreas } = await resolveAreas(
    client,
    model,
    areaRows,
    areasByParent,
    countryLevelAreas,
    alreadyLinked,
  );

  console.log("Resolving climbs...");
  const climbDecisions = await resolveClimbs(
    client,
    model,
    climbRows,
    resolvedAreas,
    areasByParent,
    climbsByArea,
    alreadyLinked,
  );

  // Betabook-internal duplicates (e.g. "Millennium"/"Millenium" both already
  // siblings under Uncategorized) -- independent of OpenBeta matching
  // entirely. Safe to auto-generate for areas (see apply.ts's
  // AreaMergeCandidate comment); climb-level duplicates are deliberately
  // left for manual review through the app's own climb_merge action.
  const areaMergeCandidates: AreaMergeCandidate[] = findInternalAreaDuplicates(areasByParent).map(
    ({ sourceId, targetId }) => ({ sourceBetabookId: sourceId, targetBetabookId: targetId }),
  );
  const climbMergeCandidates: ClimbMergeCandidate[] = [];

  const runDir = path.join(outputDir, runId);
  await mkdir(runDir, { recursive: true });

  const files: { name: string; sql: string }[] = [];
  for (const chunk of chunkStatements(renderAreaDecisions(runId, areaDecisions), maxStatements)) {
    files.push({ name: `${String(files.length + 1).padStart(3, "0")}_areas.sql`, sql: chunk });
  }
  for (const chunk of chunkStatements(renderClimbDecisions(runId, climbDecisions), maxStatements)) {
    files.push({ name: `${String(files.length + 1).padStart(3, "0")}_climbs.sql`, sql: chunk });
  }
  if (areaMergeCandidates.length > 0) {
    for (const chunk of chunkStatements(renderAreaMerges(areaMergeCandidates), maxStatements)) {
      files.push({
        name: `${String(files.length + 1).padStart(3, "0")}_area_merges.sql`,
        sql: chunk,
      });
    }
  }

  for (const file of files) {
    await writeFile(path.join(runDir, file.name), `${file.sql}\n`, "utf8");
  }

  const manifest = {
    runId,
    generatedAt: new Date().toISOString(),
    model,
    counts: {
      areas: {
        matched: areaDecisions.filter((d) => d.kind === "match").length,
        created: areaDecisions.filter((d) => d.kind === "create").length,
        skipped: areaDecisions.filter((d) => d.kind === "skip").length,
      },
      climbs: {
        matched: climbDecisions.filter((d) => d.kind === "match").length,
        created: climbDecisions.filter((d) => d.kind === "create").length,
        skipped: climbDecisions.filter((d) => d.kind === "skip").length,
      },
    },
    files: files.map((f) => f.name),
    areaMergeCandidates,
    climbMergeCandidatesForManualReview: climbMergeCandidates,
  };
  await writeFile(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Wrote ${files.length} SQL file(s) and a manifest to ${runDir}`);
  console.log(
    "Review the generated SQL, commit it, then apply each file in order with " +
      "`wrangler d1 execute betabook-db --remote --file=<file>` (see docs/openbeta-import-plan.md).",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
