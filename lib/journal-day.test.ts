import { describe, expect, it } from "vitest";

import {
  applyDayCompanions,
  applyDayTags,
  readDayEntries,
  retagDayCompanions,
  retagDayEntry,
  type DayEntryTags,
} from "./journal-day";

const row = (tags: string[], declinedDayTags: string[] = []): DayEntryTags => ({
  tags,
  declinedDayTags,
});

describe("applyDayTags", () => {
  it("adds a new day tag to every climb already queued, after its own tags", () => {
    expect(applyDayTags([row(["crimpy"]), row([])], [], ["cold"])).toEqual([
      row(["crimpy", "cold"]),
      row(["cold"]),
    ]);
  });

  it("leaves a day tag off a climb that declined it, even when added again", () => {
    expect(applyDayTags([row([], ["cold"]), row([])], [], ["cold"])).toEqual([
      row([], ["cold"]),
      row(["cold"]),
    ]);
  });

  it("removes a day tag from every climb, including one that also chose it", () => {
    expect(applyDayTags([row(["cold", "crimpy"]), row(["cold"])], ["cold"], [])).toEqual([
      row(["crimpy"]),
      row([]),
    ]);
  });

  it("doesn't duplicate a tag a climb already has", () => {
    expect(applyDayTags([row(["cold"])], [], ["cold"])).toEqual([row(["cold"])]);
  });
});

describe("retagDayEntry", () => {
  it("declines a day tag the climber takes off one climb", () => {
    expect(retagDayEntry(row(["cold", "crimpy"]), ["cold"], ["crimpy"])).toEqual(
      row(["crimpy"], ["cold"]),
    );
  });

  it("forgets the decline when the climber puts the day tag back", () => {
    expect(retagDayEntry(row(["crimpy"], ["cold"]), ["cold"], ["crimpy", "cold"])).toEqual(
      row(["crimpy", "cold"]),
    );
  });

  it("keeps a climb's own tags out of the declined list", () => {
    expect(retagDayEntry(row(["crimpy"]), ["cold"], [])).toEqual(row([]));
  });
});

describe("readDayEntries", () => {
  it("splits shared fields from rows and keeps each row's repeated fields in order", () => {
    const form = new FormData();
    form.set("entryDate", "2026-09-12");
    form.append("entry[1].climbId", "2");
    form.append("entry[0].climbId", "1");
    form.append("entry[0].tag", "a");
    form.append("entry[0].companion", "partner");
    form.append("entry[0].tag", "b");

    const { shared, entries } = readDayEntries(form);

    expect([...shared.entries()]).toEqual([["entryDate", "2026-09-12"]]);
    expect(entries.map((entry) => [...entry.entries()])).toEqual([
      [
        ["climbId", "1"],
        ["tag", "a"],
        ["companion", "partner"],
        ["tag", "b"],
      ],
      [["climbId", "2"]],
    ]);
  });

  it.each(["companion", "companionsChanged", "tag"])(
    "refuses %s at day level, where it would compete with each climb's own",
    (field) => {
      const form = new FormData();
      form.set("entryDate", "2026-09-12");
      form.set(field, "partner");
      form.set("entry[0].climbId", "1");

      expect(() => readDayEntries(form)).toThrow("Invalid day entry");
    },
  );
});

const alex = { id: "alex", name: "Alex" };
const sam = { id: "sam", name: "Sam" };
const friends = (companions: (typeof alex)[], declinedDayCompanions: string[] = []) => ({
  companions,
  declinedDayCompanions,
});

describe("applyDayCompanions", () => {
  it("adds a day friend to every climb that hasn't declined them, by id", () => {
    expect(applyDayCompanions([friends([sam]), friends([], ["alex"])], [], [alex])).toEqual([
      friends([sam, alex]),
      friends([], ["alex"]),
    ]);
  });

  it("takes a friend removed from the day off every climb", () => {
    expect(applyDayCompanions([friends([alex, sam])], [alex], [])).toEqual([friends([sam])]);
  });
});

describe("retagDayCompanions", () => {
  it("declines a day friend taken off one climb, and forgets it when put back", () => {
    const declined = retagDayCompanions(friends([alex, sam]), [alex], [sam]);
    expect(declined).toEqual(friends([sam], ["alex"]));
    expect(retagDayCompanions(declined, [alex], [sam, alex])).toEqual(friends([sam, alex]));
  });
});
