import { describe, expect, it } from "vitest";

import { groupTripDays, parseTripDayOrder } from "./trip-days";

type Send = { id: number; climbId: number; dateSent: string | null };
type Entry = { id: number; climbId: number | null; entryDate: string; isAscent: boolean };

const send = (id: number, climbId: number, dateSent: string): Send => ({ id, climbId, dateSent });
const entry = (id: number, climbId: number | null, entryDate: string, isAscent = false): Entry => ({
  id,
  climbId,
  entryDate,
  isAscent,
});

/** Each day as `[date, dayNumber, ["send:<id>" | "entry:<id>", ...]]`. */
function summary({ days }: ReturnType<typeof groupTripDays<Send, Entry>>) {
  return days.map((day) => [
    day.date,
    day.dayNumber,
    day.items.map((item) =>
      item.kind === "send" ? `send:${item.send.id}` : `entry:${item.entry.id}`,
    ),
  ]);
}

describe("groupTripDays", () => {
  it("lists only days with activity, oldest first, numbered from the trip's start", () => {
    const days = groupTripDays({
      startDate: "2026-03-10",
      sends: [send(5, 50, "2026-03-14")],
      entries: [entry(9, 90, "2026-03-12"), entry(8, null, "2026-03-10")],
    });
    expect(summary(days)).toEqual([
      ["2026-03-10", 1, ["entry:8"]],
      ["2026-03-12", 3, ["entry:9"]],
      ["2026-03-14", 5, ["send:5"]],
    ]);
  });

  it("shows a send in place of its ascent entry, and keeps the day's other entries for the climb", () => {
    const days = groupTripDays({
      startDate: "2026-03-10",
      sends: [send(5, 50, "2026-03-11")],
      entries: [
        // Logged in this order: a failed session on climb 50, a warm-up, the
        // ascent of climb 50, an attempt on another climb, then a repeat of
        // climb 50. Only the ascent repeats the send.
        entry(20, 50, "2026-03-11"),
        entry(21, 70, "2026-03-11"),
        entry(22, 50, "2026-03-11", true),
        entry(23, 80, "2026-03-11"),
        entry(24, 50, "2026-03-11"),
      ],
    });
    expect(summary(days)).toEqual([
      ["2026-03-11", 2, ["entry:20", "entry:21", "send:5", "entry:23", "entry:24"]],
    ]);
  });

  it("keeps entries for a sent climb on other days, such as earlier attempts and repeats", () => {
    const days = groupTripDays({
      startDate: "2026-03-10",
      sends: [send(5, 50, "2026-03-11")],
      entries: [
        entry(30, 50, "2026-03-10"),
        entry(31, 50, "2026-03-11", true),
        entry(32, 50, "2026-03-12"),
      ],
    });
    expect(summary(days)).toEqual([
      ["2026-03-10", 1, ["entry:30"]],
      ["2026-03-11", 2, ["send:5"]],
      ["2026-03-12", 3, ["entry:32"]],
    ]);
  });

  it("orders a day's sends by id when no entry places them", () => {
    const days = groupTripDays<Send, Entry>({
      startDate: "2026-03-10",
      sends: [send(7, 70, "2026-03-10"), send(6, 60, "2026-03-10")],
      entries: [],
    });
    expect(summary(days)).toEqual([["2026-03-10", 1, ["send:6", "send:7"]]]);
  });

  it("drops the oldest day a capped read reached, and every day before it", () => {
    const sends = [send(6, 60, "2026-03-12"), send(5, 50, "2026-03-11")];
    const entries = [entry(41, null, "2026-03-13"), entry(40, null, "2026-03-10")];

    // The send read stopped at Mar 11, so that day may be missing sends. Mar
    // 10's entry goes too: that day's sends weren't read.
    const capped = groupTripDays({ startDate: "2026-03-10", sends, entries, sendsCapped: true });
    expect(capped.truncated).toBe(true);
    // The partial day was dropped, so every day shown is complete.
    expect(capped.partialDate).toBeNull();
    expect(summary(capped)).toEqual([
      ["2026-03-12", 3, ["send:6"]],
      ["2026-03-13", 4, ["entry:41"]],
    ]);

    // When both reads stopped, the later cutoff wins.
    const both = groupTripDays({
      startDate: "2026-03-10",
      sends,
      entries: [entry(41, null, "2026-03-13"), entry(42, null, "2026-03-12")],
      sendsCapped: true,
      entriesCapped: true,
    });
    expect(summary(both)).toEqual([["2026-03-13", 4, ["entry:41"]]]);

    const complete = groupTripDays({ startDate: "2026-03-10", sends, entries });
    expect(complete.truncated).toBe(false);
    expect(complete.partialDate).toBeNull();
    expect(complete.days).toHaveLength(4);
  });

  it("keeps the one day a capped read reached rather than showing nothing", () => {
    // 3 of many more sends, all on the trip's last day: dropping the partial
    // day would leave an empty trip with no notice.
    const capped = groupTripDays<Send, Entry>({
      startDate: "2026-03-10",
      sends: [send(3, 30, "2026-03-12"), send(2, 20, "2026-03-12"), send(1, 10, "2026-03-12")],
      entries: [],
      sendsCapped: true,
    });
    expect(capped.truncated).toBe(true);
    // Kept, but flagged, so the page can say it may be incomplete.
    expect(capped.partialDate).toBe("2026-03-12");
    expect(summary(capped)).toEqual([["2026-03-12", 3, ["send:1", "send:2", "send:3"]]]);

    // The same when the entries' cutoff is the newest date either read has.
    const both = groupTripDays({
      startDate: "2026-03-10",
      sends: [send(1, 10, "2026-03-11")],
      entries: [entry(42, null, "2026-03-12"), entry(41, null, "2026-03-12")],
      entriesCapped: true,
    });
    expect(both.truncated).toBe(true);
    expect(summary(both)).toEqual([["2026-03-12", 3, ["entry:41", "entry:42"]]]);
  });
});

describe("parseTripDayOrder", () => {
  it("reads newest from the URL and treats anything else as oldest", () => {
    expect(parseTripDayOrder("newest")).toBe("newest");
    for (const value of [undefined, "", "oldest", "NEWEST", "desc", ["newest", "oldest"]]) {
      expect(parseTripDayOrder(value)).toBe("oldest");
    }
  });
});
