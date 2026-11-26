/** Narrowing readers for untrusted JSON that throw `fail()` on an unexpected shape. */
export function jsonGuards(fail: () => Error) {
  function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
    return value as Record<string, unknown>;
  }
  function string(value: unknown): string {
    if (typeof value !== "string") throw fail();
    return value;
  }
  /** Null and undefined read as "". */
  function optionalString(value: unknown): string {
    return value == null ? "" : string(value);
  }
  return { record, string, optionalString };
}
