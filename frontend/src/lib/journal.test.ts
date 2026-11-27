import { expect, it } from "vitest";

import { isValidJournalTag, normalizeTag } from "./journal";

it("normalizes the typed hashtag before checking it", () => {
  const tag = normalizeTag(" ##Happy-Boulders ");
  expect(tag).toBe("happy-boulders");
  expect(isValidJournalTag(tag)).toBe(true);
  expect(isValidJournalTag(normalizeTag(" happy boulders "))).toBe(false);
  expect(isValidJournalTag(normalizeTag("#"))).toBe(false);
});
