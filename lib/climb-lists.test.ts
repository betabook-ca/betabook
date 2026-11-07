import { describe, expect, it } from "vitest";

import {
  MAX_CLIMB_LIST_TITLE,
  climbListInputSchema,
  copyClimbListTitle,
  moveClimb,
  parseClimbListView,
} from "@/lib/climb-lists";

describe("copyClimbListTitle", () => {
  it("keeps someone else's name as it is", () => {
    expect(copyClimbListTitle("Red River classics", { own: false })).toBe("Red River classics");
  });

  it("marks a copy of your own list", () => {
    expect(copyClimbListTitle("Red River classics", { own: true })).toBe(
      "Red River classics (copy)",
    );
  });

  it("trims a long name so the copy still fits", () => {
    const title = copyClimbListTitle("x".repeat(MAX_CLIMB_LIST_TITLE), { own: true });
    expect(Array.from(title)).toHaveLength(MAX_CLIMB_LIST_TITLE);
    expect(title.endsWith("x (copy)")).toBe(true);
    expect(climbListInputSchema.safeParse({ title }).success).toBe(true);
  });

  it("counts an emoji as one character, as SQLite does", () => {
    const title = copyClimbListTitle("🧗".repeat(MAX_CLIMB_LIST_TITLE), { own: true });
    expect(Array.from(title)).toHaveLength(MAX_CLIMB_LIST_TITLE);
  });
});

describe("parseClimbListView", () => {
  it("reads a sort and a sent filter", () => {
    expect(parseClimbListView({ sort: "grade_desc", sent: "unsent" })).toEqual({
      sort: "grade_desc",
      sent: "unsent",
    });
  });

  it("falls back to list order and all climbs for anything else", () => {
    expect(parseClimbListView({ sort: "rating_desc", sent: "maybe" })).toEqual({
      sort: "position_asc",
      sent: "all",
    });
    expect(parseClimbListView({})).toEqual({ sort: "position_asc", sent: "all" });
  });
});

describe("moveClimb", () => {
  it("moves a climb before or after another", () => {
    expect(moveClimb([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveClimb([1, 2, 3, 4], 1, 3, "after")).toEqual([2, 3, 1, 4]);
  });

  it("leaves the order alone for unknown or identical ids", () => {
    expect(moveClimb([1, 2], 1, 1)).toEqual([1, 2]);
    expect(moveClimb([1, 2], 9, 1)).toEqual([1, 2]);
  });
});
