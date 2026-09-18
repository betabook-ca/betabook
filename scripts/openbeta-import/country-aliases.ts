// Country-name aliases confirmed against a real run against Betabook's
// production catalog (10,237 areas) and the real OpenBeta parquet export
// (189,087 climbs, 17,200 synthesized area nodes): plain fuzzy matching
// alone does not bridge "USA" vs "United States" or "Vietnam" vs "Viet Nam"
// -- these are legitimate spelling-convention differences, not typos, and
// Jaro-Winkler correctly does not treat them as near-duplicates. This table
// is a targeted, hand-verified fix for exactly the mismatches actually
// observed, not a general ISO-3166 alias table -- extend it as new
// mismatches turn up in a real run's "created" country-level rows.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  vietnam: "Viet Nam",
  "people's republic of china": "China",
  "lao people's democratic republic": "Laos",
};

/** Returns the Betabook-spelled equivalent of an OpenBeta country name, or
 * the name unchanged if no alias is known (including when it already
 * matches Betabook's own spelling). */
export function normalizeCountryName(openBetaName: string): string {
  return COUNTRY_ALIASES[openBetaName.trim().toLowerCase()] ?? openBetaName;
}
