import type { components } from "@/spa/generated/api";

export type JournalKind = components["schemas"]["JournalKind"];
export const MAX_JOURNAL_TAGS = 8;
export const MAX_JOURNAL_TAG_LENGTH = 24;

/** The one hashtag normalizer: trims, drops any leading `#`s and lowercases, so
 * `##Foo`, `#foo` and ` foo ` all name the stored tag `foo`. Saving, the tag
 * field and every hashtag filter go through it. */
export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

export function isValidJournalTag(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}
