// Synthesizes area nodes from routes' breadcrumb columns (parquet.ts /
// types.ts), since the default OpenBeta parquet export has no area-entity
// rows of its own — only per-route text breadcrumbs (country/state_province/
// region/area/crag). One node per unique breadcrumb *prefix* across all
// routes: ["USA"], ["USA","Colorado"], ["USA","Colorado","Boulder Canyon"],
// etc. each become their own node, so the resulting tree has exactly the
// same shape a real area-entity export would.
import type { OpenBetaAreaRow } from "./types.ts";

/** A character vanishingly unlikely to appear in a real place name, so the
 * joined path can double as a stable, deterministic external id — the same
 * breadcrumb prefix always yields the same id across runs (and across
 * different machines), which is what makes catalog_external_refs's
 * (source, external_id) crosswalk actually work as a cache for a later
 * re-sync: a route whose breadcrumb hasn't changed resolves to the same
 * synthesized area id it did last time, without needing OpenBeta to have
 * assigned that area a uuid of its own. */
const PATH_SEPARATOR = "␟";

export function breadcrumbExternalId(prefix: readonly string[]): string {
  return prefix.join(PATH_SEPARATOR);
}

/** One node per unique prefix across every route's breadcrumb, sorted
 * shallowest-first — already the topological (parent-before-child) order
 * run.ts's area-resolution walk needs, so no separate sort step is required
 * there. */
export function synthesizeAreaNodes(
  breadcrumbs: readonly (readonly string[])[],
): OpenBetaAreaRow[] {
  const nodes = new Map<string, OpenBetaAreaRow>();
  for (const breadcrumb of breadcrumbs) {
    for (let depth = 1; depth <= breadcrumb.length; depth += 1) {
      const prefix = breadcrumb.slice(0, depth);
      const externalId = breadcrumbExternalId(prefix);
      if (nodes.has(externalId)) continue;
      nodes.set(externalId, {
        uuid: externalId,
        areaName: prefix[depth - 1],
        pathTokens: prefix.slice(0, -1),
        parentUuid: depth > 1 ? breadcrumbExternalId(prefix.slice(0, -1)) : null,
        latitude: null,
        longitude: null,
      });
    }
  }
  return [...nodes.values()].sort((a, b) => a.pathTokens.length - b.pathTokens.length);
}
