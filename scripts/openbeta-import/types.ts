// Shared types for the OpenBeta catalog reconciliation pipeline
// (docs/openbeta-import-plan.md). No imports from `@/`-aliased app code:
// everything under scripts/openbeta-import/ runs as plain Node (type
// stripping only, no bundler), which cannot resolve that alias.

export type Discipline = "boulder" | "sport" | "trad";

/** A Betabook area, as loaded from the local D1 snapshot (Phase 1), with its
 * root-first ancestor names attached for blocking/tie-breaking. */
export type BetabookAreaCandidate = {
  id: number;
  name: string;
  parentId: number | null;
  latitude: number | null;
  longitude: number | null;
  /** Root-first ancestor names, excluding this area itself. */
  ancestors: string[];
};

/** A Betabook climb, as loaded from the local D1 snapshot (Phase 1). */
export type BetabookClimbCandidate = {
  id: number;
  name: string;
  type: Discipline;
  grade: number | null;
  areaId: number;
  latitude: number | null;
  longitude: number | null;
};

// OpenBeta's public dataset shape, confirmed against the real
// OpenBeta/parquet-exporter project (github.com/OpenBeta/parquet-exporter,
// schema.sql as of its 2026-09-06 release — see parquet.ts's top comment).
// The default export is a single flat table, one row per route, with the
// area hierarchy denormalized onto each row as text breadcrumb columns
// rather than a separate area-entity table with its own uuids — there is no
// OpenBeta-native area uuid to carry here. schema.sql is user-customizable
// (other exports may add/drop columns), so treat this as the confirmed
// *default* shape, not a guarantee of every possible export.

export type OpenBetaClimbRow = {
  uuid: string;
  name: string;
  /** Root-first location breadcrumb (country/state/region/area/crag in the
   * default schema — see BREADCRUMB_COLUMNS in parquet.ts), used to
   * synthesize area nodes (breadcrumbs.ts) since this export has none of its
   * own. Never empty — mapOpenBetaClimbRow skips a row that has no
   * recognizable breadcrumb rather than producing one. */
  breadcrumb: string[];
  /** Disciplines this route carries, in OpenBeta's own vocabulary — may
   * include values Betabook has no bucket for (aid, ice, mixed, alpine). */
  disciplines: string[];
  /** Raw grade strings, one per grading system OpenBeta records (yds, vscale,
   * french, font, ...). */
  grades: Record<string, string>;
  latitude: number | null;
  longitude: number | null;
};

/** A synthesized area node — this export has no area-entity rows of its
 * own, so breadcrumbs.ts derives one per unique breadcrumb prefix across all
 * routes (see its own comment for how externalId is derived and why that
 * makes it stable across runs). Shaped like an OpenBeta area row would be,
 * so match-areas.ts and run.ts's area-resolution walk don't need to know the
 * source is synthetic. */
export type OpenBetaAreaRow = {
  uuid: string;
  areaName: string;
  /** Root-first ancestor area names, excluding this node itself. */
  pathTokens: string[];
  /** This node's direct parent, by its own synthesized uuid — null for a
   * root (country-level) node. */
  parentUuid: string | null;
  /** This export has no area-level coordinates (only per-route lat/lng) —
   * always null. A future enhancement could centroid child routes' own
   * coordinates instead; not implemented here. */
  latitude: number | null;
  longitude: number | null;
};

export type MatchMethod = "exact" | "fuzzy" | "llm" | "created";

/** The outcome of narrowing one external row against a candidate list.
 * "ambiguous" is not a failure — it's the handoff point to LLM arbitration
 * (llm-arbitrate.ts) in Phase 2/3, or to a human in a future interactive
 * path; the pure matchers here never guess past it. */
export type MatchDecision<TCandidate> =
  | { kind: "match"; candidate: TCandidate; method: "exact" | "fuzzy" }
  | { kind: "create" }
  | { kind: "ambiguous"; candidates: TCandidate[] };
