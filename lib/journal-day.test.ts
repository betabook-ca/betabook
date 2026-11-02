import { describe, expect, it } from "vitest";

import { applyDayTags, readDayEntries, retagDayEntry, type DayEntryTags } from "./journal-day";

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
    form.append("companion", "partner");
    form.append("entry[1].climbId", "2");
    form.append("entry[0].climbId", "1");
    form.append("entry[0].tag", "a");
    form.append("entry[0].tag", "b");

    const { shared, entries } = readDayEntries(form);

    expect([...shared.entries()]).toEqual([
      ["entryDate", "2026-09-12"],
      ["companion", "partner"],
    ]);
    expect(entries.map((entry) => [...entry.entries()])).toEqual([
      [
        ["climbId", "1"],
        ["tag", "a"],
        ["tag", "b"],
      ],
      [["climbId", "2"]],
    ]);
  });
});
