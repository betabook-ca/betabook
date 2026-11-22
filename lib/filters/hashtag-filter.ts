import { isValidJournalTag, normalizeTag } from "@/lib/journal";

/** Hashtag filter values as stored journal tags: normalized, deduplicated, and
 * with anything that could never be a tag dropped. */
export function normalizeHashtagFilters(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeTag).filter(isValidJournalTag))];
}
