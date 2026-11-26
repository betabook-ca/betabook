import type { UrlParamsRecord } from "@/lib/url-params";

const LIGATURE_MAP: Record<string, string> = {
  æ: "ae",
  ø: "o",
  ß: "ss",
  ł: "l",
  œ: "oe",
  ð: "d",
  þ: "th",
  đ: "d",
};

/** Turns a name into a URL slug: lowercased, ASCII, hyphen-separated, accents
 * flattened, apostrophes dropped so "Don't" becomes "dont", European ligatures
 * transliterated. Capped at 80 chars with no trailing hyphen. Returns "" when
 * nothing slug-able survives (a CJK-only name, pure punctuation) — the href
 * builders read that as "no slug segment". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[æøßłœðþđ]/g, (c) => LIGATURE_MAP[c] ?? c)
    .replace(/['’]+/g, "") // drop apostrophes so the word stays whole
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** Canonical site-relative path for a climb. The numeric id is authoritative;
 * the slug is decorative and a wrong or missing one 308s to this
 * (see app/climbs/[id]/[[...slug]]/page.tsx). */
export function climbHref(id: number, name: string): string {
  const slug = slugify(name);
  return slug ? `/climbs/${id}/${slug}` : `/climbs/${id}`;
}

/** Canonical site-relative path for an area — same contract as `climbHref`. */
export function areaHref(id: number, name: string): string {
  const slug = slugify(name);
  return slug ? `/areas/${id}/${slug}` : `/areas/${id}`;
}

/** Re-attaches a search-param record to a path, so the canonical redirect
 * keeps a shared "?grade=..." link pointed at the filtered view. */
export function withQuery(path: string, params: UrlParamsRecord): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value == null ? [] : [value]) {
      qs.append(key, v);
    }
  }
  const search = qs.toString();
  return search ? `${path}?${search}` : path;
}
