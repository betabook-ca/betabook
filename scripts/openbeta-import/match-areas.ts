// Phase 2: area reconciliation. Blocking (by normalized country/region name
// and coordinate grid cell) is the caller's job, using the full snapshot
// index built in snapshot.ts — this module only narrows within whatever
// candidate list it's given for one OpenBeta area.
import { resolveByName } from "./name-resolve.ts";
import type { BetabookAreaCandidate, MatchDecision, OpenBetaAreaRow } from "./types.ts";

const EARTH_RADIUS_KM = 6371;
/** A candidate must be at least this many times closer than the runner-up to
 * break a naming tie by location alone, rather than guess between two
 * similarly-distant, similarly-named areas. */
const DECISIVE_PROXIMITY_RATIO = 2;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometers. */
export function haversineDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Only breaks the tie when every ambiguous candidate has coordinates —
 * otherwise a candidate missing GPS could be the true match and this would
 * wrongly discard it. */
function breakTieByProximity(
  openBetaArea: OpenBetaAreaRow,
  candidates: readonly BetabookAreaCandidate[],
): BetabookAreaCandidate | null {
  if (openBetaArea.latitude == null || openBetaArea.longitude == null) return null;
  const origin = { latitude: openBetaArea.latitude, longitude: openBetaArea.longitude };

  const located = candidates
    .filter(
      (c): c is BetabookAreaCandidate & { latitude: number; longitude: number } =>
        c.latitude != null && c.longitude != null,
    )
    .map((candidate) => ({
      candidate,
      distanceKm: haversineDistanceKm(origin, {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      }),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (located.length < candidates.length || located.length === 0) return null;
  if (located.length === 1) return located[0].candidate;

  const [closest, runnerUp] = located;
  if (runnerUp.distanceKm === 0) return null;
  return closest.distanceKm * DECISIVE_PROXIMITY_RATIO <= runnerUp.distanceKm
    ? closest.candidate
    : null;
}

/** Resolves one OpenBeta area against a pre-blocked set of Betabook area
 * candidates. Name resolution first (resolveByName); a genuine multi-
 * candidate naming tie is then broken by GPS proximity when every tied
 * candidate has coordinates and one is decisively closer — otherwise the
 * tie stands and goes to LLM arbitration. `options.allowFuzzy` forwards to
 * resolveByName — see its own comment for why a wide, structurally-
 * uncorrelated candidate pool should pass `allowFuzzy: false`. */
export function matchArea(
  openBetaArea: OpenBetaAreaRow,
  candidates: readonly BetabookAreaCandidate[],
  options?: { allowFuzzy?: boolean },
): MatchDecision<BetabookAreaCandidate> {
  const decision = resolveByName(openBetaArea.areaName, candidates, (c) => c.name, options);
  if (decision.kind !== "ambiguous") return decision;

  const closest = breakTieByProximity(openBetaArea, decision.candidates);
  if (closest) return { kind: "match", candidate: closest, method: "fuzzy" };
  return decision;
}
