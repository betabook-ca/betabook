/** Only the canonical decimal form of a positive integer is an id.
 *
 * A string's shape is checked before the conversion, not after: `Number` also
 * accepts exponent, hex, padded and trailing-zero forms, so `1e0`, `0x1`,
 * ` 1 ` and `1.0` would all become 1 and give every record an unbounded set
 * of URL aliases, each rendering the same page under a different address
 * with no canonical among them. An absent query param (`null`) parses as
 * absent, so callers need no fallback string. */
const CANONICAL_ID = /^[1-9]\d*$/;

export function parseId(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "string" && !CANONICAL_ID.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
