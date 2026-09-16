import { describe, expect, it } from "vitest";

import { getTourDemoJournalPage } from "@/lib/product-tour-demo";

describe("Journal tutorial preview", () => {
  const filters = { kind: null, query: "", tag: null, showAll: false };

  it("starts with three entries and can expand the full journal", () => {
    const page = getTourDemoJournalPage(filters);
    expect(page.visible).toHaveLength(3);
    expect(page.matches).toHaveLength(8);
    expect(getTourDemoJournalPage({ ...filters, showAll: true }).visible).toEqual(page.matches);
  });

  it("searches entries beyond the three initially displayed rows", () => {
    const page = getTourDemoJournalPage({ ...filters, query: " FIRST CLIMB " });
    expect(page.visible.map((entry) => entry.id)).toEqual(["warmup"]);
  });

  it("combines entry type, tag, and search across the whole journal", () => {
    const page = getTourDemoJournalPage({ ...filters, kind: "training", tag: "footwork" });
    expect(page.visible.map((entry) => entry.id)).toEqual(["training"]);
    expect(
      getTourDemoJournalPage({ ...filters, kind: "training", tag: "footwork", query: "pull-ups" })
        .matches,
    ).toEqual([]);
    expect(
      getTourDemoJournalPage({ ...filters, tag: "strength" }).visible.map((entry) => entry.id),
    ).toEqual(["strength"]);
  });
});
