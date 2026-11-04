import { describe, expect, it } from "vitest";

import { readDayEntries } from "./journal-day";

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
