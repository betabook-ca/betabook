/** Every share token the app issues is `lower(hex(randomblob(16)))`, written
 * by a column default or a trigger in SQL rather than by application code.
 * Validating the shape before touching D1 keeps an arbitrary path segment out
 * of a lookup, the same reason `readProfilePhoto` re-checks its key. */
const SHARE_TOKEN = /^[0-9a-f]{32}$/;

export function parseShareToken(value: unknown): string | null {
  return typeof value === "string" && SHARE_TOKEN.test(value) ? value : null;
}
