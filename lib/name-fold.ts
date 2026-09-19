/** Pure string-folding helpers with no other repo imports, so scripts that
 * run outside the app (via plain `node`, which does not resolve the `@/`
 * path alias) can import this file directly instead of pulling in
 * lib/import-matching.ts's whole module graph. lib/import-matching.ts
 * re-exports these for its existing callers. */

/** Match SQLite LOWER(TRIM(name)): trim ASCII spaces and lowercase only ASCII
 * letters. JavaScript toLowerCase would also fold accented letters. */
export function foldClimbName(name: string): string {
  return name.replace(/^ +| +$/g, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
}

// Unicode-letter/number-aware (\p{L}\p{N}, not [a-z0-9]) so a name entirely
// in a non-Latin script (e.g. "北京", "上海") is treated as real name content
// rather than being stripped as leading decoration/punctuation -- ASCII-only
// classes previously folded any two such names to the same empty key.
const LEADING_LABEL = /^[^\p{L}\p{N}(]*(?:\([a-z0-9]{1,3}\))?[^\p{L}\p{N}]*/u;
const LEADING_ARTICLE_KEY = /^(?:the|a|an) /;

/** Deliberately lossy, so it only ever confirms a signal: catalogs decorate
 * area names differently ("**Bouldering at Exit 38", "(g) Black Dyke"). */
export function looseNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['‘’ʼ]/g, "")
    .replace(LEADING_LABEL, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^ | $/g, "")
    .replace(LEADING_ARTICLE_KEY, "");
}

const LEADING_ARTICLE = /^(?:the|a|an) +/i;
const MAX_NAME_VARIANTS = 8;

/** Variants keep the indexed name lookup rather than widening the query. */
export function climbNameVariants(name: string): string[] {
  const original = foldClimbName(name);
  const seen = new Set<string>([original]);
  const variants: string[] = [];
  const add = (value: string) => {
    const trimmed = value.replace(/ +/g, " ").replace(/^ | $/g, "");
    const key = foldClimbName(trimmed);
    if (!trimmed || seen.has(key) || variants.length >= MAX_NAME_VARIANTS) return;
    seen.add(key);
    variants.push(trimmed);
  };
  const stripped = name.replace(LEADING_ARTICLE, "");
  const bases = LEADING_ARTICLE.test(name) ? [name, stripped] : [name, `The ${name}`];
  for (const base of bases) {
    add(base);
    add(base.replace(/[‘’ʼ]/g, "'"));
    add(base.replace(/'/g, "’"));
    add(base.replace(/['‘’ʼ,.!?]/g, ""));
    add(base.replace(/[-–—/]+/g, " "));
    add(base.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  }
  return variants;
}
