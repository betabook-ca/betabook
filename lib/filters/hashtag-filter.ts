/** Accept the familiar # prefix while matching stored journal tags exactly. */
function normalizeHashtagFilter(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

export function normalizeHashtagFilters(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeHashtagFilter).filter(Boolean))];
}
