// Generic exact/loose/fuzzy name narrowing, shared by match-areas.ts and
// match-climbs.ts. foldClimbName/looseNameKey come from lib/name-fold.ts (a
// dependency-free leaf module — see its own comment for why that matters for
// code that runs outside the app).
// Bare Node.js does not resolve the app's @/ alias; share the fold helpers directly.
// oxlint-disable-next-line import/no-relative-parent-imports
import { foldClimbName, looseNameKey } from "../../lib/name-fold.ts";
import { jaroWinkler } from "./fuzzy.ts";
import type { MatchDecision } from "./types.ts";

/** Below this Jaro-Winkler score, two names are not considered a fuzzy match
 * at all — picked conservatively (most true near-duplicates score well above
 * 0.95; this leaves room for OCR/transliteration noise without accepting
 * unrelated short names, which Jaro-Winkler tends to score generously). */
const FUZZY_MATCH_THRESHOLD = 0.92;

/** Narrows a candidate list for one external name to a single confident
 * match, a create decision, or an ambiguous set for further (e.g. LLM)
 * arbitration. Tries, in order: exact folded-name equality, a looser
 * accent/punctuation-insensitive key, then Jaro-Winkler similarity. A tie at
 * any stage — more than one candidate equally good — is ambiguous, never
 * guessed; a fuzzy match only applies when exactly one candidate clears the
 * threshold with no other candidate tied at the same top score.
 *
 * `allowFuzzy: false` skips the Jaro-Winkler tier entirely, falling straight
 * to "create" past the exact/loose tiers instead. Callers searching a large,
 * structurally-uncorrelated candidate pool (e.g. run.ts's area-matching
 * fallback across an entire subtree rather than true siblings) should pass
 * this — Jaro-Winkler's prefix bonus readily conflates a short name with an
 * unrelated longer name that happens to share its start (e.g. "Okanagan" vs
 * "Okanagan Falls", two different real places), a risk that's much smaller
 * against a true sibling list where structural adjacency already vouches for
 * relatedness. */
export function resolveByName<T>(
  name: string,
  candidates: readonly T[],
  getName: (candidate: T) => string,
  options?: { allowFuzzy?: boolean },
): MatchDecision<T> {
  if (candidates.length === 0) return { kind: "create" };

  // A punctuation-only name ("!!!", "???") folds/loose-keys to "" -- an
  // empty key is not a real signal, so skip a tier entirely rather than
  // letting two unrelated punctuation-only names "match" each other.
  const foldedName = foldClimbName(name);
  if (foldedName !== "") {
    const exact = candidates.filter((c) => foldClimbName(getName(c)) === foldedName);
    if (exact.length === 1) return { kind: "match", candidate: exact[0], method: "exact" };
    if (exact.length > 1) return { kind: "ambiguous", candidates: exact };
  }

  const looseKey = looseNameKey(name);
  if (looseKey !== "") {
    const loose = candidates.filter((c) => looseNameKey(getName(c)) === looseKey);
    if (loose.length === 1) return { kind: "match", candidate: loose[0], method: "exact" };
    if (loose.length > 1) return { kind: "ambiguous", candidates: loose };
  }

  if (options?.allowFuzzy === false || looseKey === "") return { kind: "create" };

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: jaroWinkler(looseKey, looseNameKey(getName(candidate))),
    }))
    .filter((entry) => entry.score >= FUZZY_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: "create" };
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return { kind: "match", candidate: scored[0].candidate, method: "fuzzy" };
  }
  return { kind: "ambiguous", candidates: scored.map((entry) => entry.candidate) };
}
