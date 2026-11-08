import { describe, expect, it } from "vitest";

import {
  MAX_CLIMB_LIST_TITLE,
  climbListInputSchema,
  DEFAULT_CLIMB_LIST_VIEW,
  climbListViewSearch,
  copyClimbListTitle,
  isFilteredClimbList,
  moveClimb,
  parseClimbListView,
} from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import { searchParamsToRecord } from "@/lib/url-params";

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
  it("reads the list's sort, text, disciplines and Filters panel, but not area", () => {
    const view = parseClimbListView({
      sort: "grade_desc",
      excludeSent: "1",
      discipline: "boulder",
      name: "crimp",
      areaId: "2",
      areaName: "Cave",
    });
    expect(view.sort).toBe("grade_desc");
    expect(view.filter).toMatchObject({
      excludeSent: true,
      disciplines: ["boulder"],
      name: "crimp",
    });
    expect(view.filter).not.toHaveProperty("areaId");
    expect(view.filter).not.toHaveProperty("areaName");
  });

  it("trims the name, and treats a name of only spaces as none", () => {
    expect(parseClimbListView({ name: "  crimp " }).filter.name).toBe("crimp");
    expect(parseClimbListView({ name: "   " })).toEqual(DEFAULT_CLIMB_LIST_VIEW);
    expect(parseClimbListView({ name: "   " }).filter).not.toHaveProperty("name");
  });

  it("falls back to list order and no filters for anything else", () => {
    expect(parseClimbListView({ sort: "rating_desc", sent: "unsent" })).toEqual(
      DEFAULT_CLIMB_LIST_VIEW,
    );
  });
});

describe("climbListViewSearch", () => {
  it("keeps the plain list URL plain", () => {
    expect(climbListViewSearch(DEFAULT_CLIMB_LIST_VIEW)).toBe("");
    expect(isFilteredClimbList(DEFAULT_CLIMB_FILTER)).toBe(false);
  });

  it("round trips a sorted, filtered view", () => {
    const view = {
      sort: "name_asc" as const,
      filter: { ...DEFAULT_CLIMB_FILTER, excludeSent: true, minAscents: 2, name: "crimp" },
    };
    const search = climbListViewSearch(view);
    expect(search).toContain("excludeSent=1");
    expect(search).toContain("name=crimp");
    expect(isFilteredClimbList(view.filter)).toBe(true);
    const parsed = parseClimbListView(searchParamsToRecord(new URLSearchParams(search)));
    expect(parsed).toEqual(view);
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
