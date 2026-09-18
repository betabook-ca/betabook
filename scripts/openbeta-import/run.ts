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
import { arbitrate, resolveArbitration, DEFAULT_ARBITRATION_MODEL } from "./llm-arbitrate.ts";
import { matchArea } from "./match-areas.ts";
import { matchClimb } from "./match-climbs.ts";
import { inspectParquetSchema, mapOpenBetaClimbRows, readParquetRows } from "./parquet.ts";
import {
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

type PendingAreaResolution = { status: "matched"; betabookId: number } | { status: "created" };

/** Walks OpenBeta areas top-down by parentUuid (roots first), resolving each
 * against the snapshot's existing areas (blocked to the already-resolved
 * parent's own children) or creating it, arbitrating via LLM whatever
 * deterministic matching leaves ambiguous. Returns per-area decisions plus
 * the externalId -> resolution map climbs need to attach to. */
async function resolveAreas(
  client: Anthropic,
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

  async function resolveOne(row: OpenBetaAreaRow): Promise<void> {
    const alreadyLinkedId = alreadyLinked.get(row.uuid);
    if (alreadyLinkedId !== undefined) {
      resolved.set(row.uuid, { status: "matched", betabookId: alreadyLinkedId });
      return;
    }

    const { parentUuid } = row;
    const isRoot = parentUuid === null;
    const resolvedParent = parentUuid === null ? null : resolved.get(parentUuid);
    const candidates = isRoot
      ? countryLevelAreas
      : resolvedParent?.status === "matched"
        ? (areasByParent.get(resolvedParent.betabookId) ?? [])
        : []; // parent was created (or itself unresolved) -- it has no existing children to match against

    // Country-name spelling conventions vary too widely for pure fuzzy
    // matching (see country-aliases.ts) -- normalize only for the match
    // attempt, never for what a "create" decision actually names the area.
    const matchSubject = isRoot ? { ...row, areaName: normalizeCountryName(row.areaName) } : row;
    const decision =
      candidates.length === 0 ? { kind: "create" as const } : matchArea(matchSubject, candidates);

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
      resolved.set(row.uuid, { status: "matched", betabookId: decision.candidate.id });
    } else if (decision.kind === "create") {
      decisions.push({
        kind: "create",
        externalId: row.uuid,
        name: row.areaName,
        parentExternalId: row.parentUuid,
        latitude: row.latitude,
        longitude: row.longitude,
      });
      resolved.set(row.uuid, { status: "created" });
    } else {
      const outcome = resolveArbitration(
        await arbitrate(
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
        resolved.set(row.uuid, { status: "matched", betabookId: outcome.candidateId });
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
        resolved.set(row.uuid, { status: "created" });
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
  client: Anthropic,
  model: string,
  climbRows: readonly OpenBetaClimbRow[],
  resolvedAreas: ReadonlyMap<string, PendingAreaResolution>,
  climbsByArea: Map<number, BetabookClimbCandidate[]>,
  alreadyLinked: ReadonlyMap<string, number>,
): Promise<ResolvedClimbDecision[]> {
  const decisions: ResolvedClimbDecision[] = [];

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

    const candidates =
      parent.status === "matched" ? (climbsByArea.get(parent.betabookId) ?? []) : [];
    const decision =
      candidates.length === 0
        ? { kind: "create" as const }
        : matchClimb(route.name, discipline, grade, candidates);

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
        await arbitrate(
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
  const maxStatements = Number(args.get("max-statements") ?? MAX_STATEMENTS_PER_FILE_DEFAULT);

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

  const client = new Anthropic();

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
