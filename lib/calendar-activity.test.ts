import { expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";
import type { AnalyticsJournalSession } from "@/lib/user-analytics";

import { calendarCountsForDisciplines } from "./calendar-activity";

const sends: Pick<AnalyticsSendRow, "climbType" | "dateSent">[] = [
  { climbType: "boulder", dateSent: "2026-06-01" },
  { climbType: "sport", dateSent: "2026-06-01" },
  { climbType: "trad", dateSent: null },
];
const sessions: AnalyticsJournalSession[] = [
  { entryDate: "2026-06-01", climbType: "boulder", count: 2 },
  { entryDate: "2026-06-01", climbType: "sport", count: 1 },
  { entryDate: "2026-06-02", climbType: "trad", count: 1 },
];

it("combines selected disciplines on the same day without duplicating the day", () => {
  expect(calendarCountsForDisciplines(sends, sessions, ["boulder", "sport", "trad"])).toEqual({
    "2026-06-01": 3,
    "2026-06-02": 1,
  });
  expect(calendarCountsForDisciplines(sends, sessions, ["boulder", "trad"])).toEqual({
    "2026-06-01": 2,
    "2026-06-02": 1,
  });
});

it("uses dated sends when journal sessions are unavailable", () => {
  expect(calendarCountsForDisciplines(sends, undefined, ["boulder", "sport"])).toEqual({
    "2026-06-01": 2,
  });
  expect(calendarCountsForDisciplines(sends, undefined, ["trad"])).toEqual({});
});
