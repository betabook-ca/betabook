// Jaro-Winkler string similarity, hand-rolled to avoid pulling in a general
// NLP library (e.g. `natural`) for one small algorithm. Chosen over plain
// Jaro or Levenshtein because it weights agreement at the start of the
// string more heavily, which suits short proper-noun names ("Millennium" vs
// "Millenium") better than edit distance alone.

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(aLen, bLen) / 2) - 1, 0);
  const aMatches = Array.from<boolean>({ length: aLen }).fill(false);
  const bMatches = Array.from<boolean>({ length: bLen }).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  return (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3;
}

function commonPrefixLength(a: string, b: string, max: number): number {
  const limit = Math.min(a.length, b.length, max);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/** Standard Jaro-Winkler: the Jaro score, boosted by up to a 4-character
 * common prefix scaled by `prefixScale`. Returns a value in [0, 1], 1 being
 * identical strings. */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const jaroScore = jaro(a, b);
  const prefixLength = commonPrefixLength(a, b, 4);
  return jaroScore + prefixLength * prefixScale * (1 - jaroScore);
}
