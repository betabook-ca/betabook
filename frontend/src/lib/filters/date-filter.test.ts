import { describe, expect, it } from "vitest";

import {
  DEFAULT_JOURNAL_FILTER,
  journalFilterToSearchParams,
  parseJournalFilter,
} from "@/lib/filters/journal-filter";
import {
  DEFAULT_USER_SENDS_FILTER,
  userSendsFilterToSearchParams,
  parseUserSendsFilter,
} from "@/lib/filters/user-sends-filter";

import { datePresetFilter } from "./date-filter";

describe("date presets", () => {
  it.each([
    ["this-month", "2026-09-07", "2026-09-01", "2026-09-30"],
    ["this-month", "2024-02-10", "2024-02-01", "2024-02-29"],
    ["this-month", "2025-02-10", "2025-02-01", "2025-02-28"],
    ["this-year", "2026-09-07", "2026-01-01", "2026-12-31"],
    ["last-year", "2026-01-01", "2025-01-01", "2025-12-31"],
  ] as const)(
    "resolves %s on %s to inclusive calendar boundaries",
    (preset, today, dateFrom, dateTo) => {
      expect(datePresetFilter(preset, today)).toEqual({
        date: undefined,
        dateFrom,
        dateTo,
        datePreset: preset,
      });
    },
  );
});

describe("preset URLs", () => {
  it.each([parseUserSendsFilter, parseJournalFilter])(
    "retains a preset and its concrete date bounds",
    (parse) => {
      expect(
        parse({ datePreset: "last-year", dateFrom: "2025-01-01", dateTo: "2025-12-31" }),
      ).toMatchObject({ datePreset: "last-year", dateFrom: "2025-01-01", dateTo: "2025-12-31" });
      expect(parse({ datePreset: "last-year" })).not.toHaveProperty("datePreset");
      expect(
        parse({ datePreset: "unknown", dateFrom: "2025-01-01", dateTo: "2025-12-31" }),
      ).not.toHaveProperty("datePreset");
    },
  );
  it("round-trips presets in Sends and Journal and clears them with dates", () => {
    const dates = datePresetFilter("this-month", "2024-02-15");
    const sends = userSendsFilterToSearchParams({ ...DEFAULT_USER_SENDS_FILTER, ...dates });
    const journal = journalFilterToSearchParams({ ...DEFAULT_JOURNAL_FILTER, ...dates });
    for (const params of [sends, journal]) {
      expect(params.get("datePreset")).toBe("this-month");
      expect(params.get("dateFrom")).toBe("2024-02-01");
      expect(params.get("dateTo")).toBe("2024-02-29");
    }
    const cleared = journalFilterToSearchParams({
      ...DEFAULT_JOURNAL_FILTER,
      datePreset: "this-month",
    });
    expect(cleared.has("datePreset")).toBe(false);
  });
});
