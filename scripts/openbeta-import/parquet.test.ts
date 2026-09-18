import { describe, expect, it } from "vitest";

import { mapOpenBetaClimbRow, mapOpenBetaClimbRows } from "./parquet.ts";

describe("mapOpenBetaClimbRow", () => {
  it("maps a row using the primary (schema.sql) field names", () => {
    const result = mapOpenBetaClimbRow({
      climb_id: "climb-1",
      climb_name: "Superfly",
      country: "USA",
      state_province: "Colorado",
      area: "Boulder Canyon",
      crag: "Animal World",
      is_boulder: true,
      grade_vscale: "V5",
      latitude: 40.02,
      longitude: -105.28,
    });
    expect(result).toEqual({
      row: {
        uuid: "climb-1",
        name: "Superfly",
        breadcrumb: ["USA", "Colorado", "Boulder Canyon", "Animal World"],
        disciplines: ["boulder"],
        grades: { vscale: "V5" },
        latitude: 40.02,
        longitude: -105.28,
      },
    });
  });

  it("falls back through alternate field name candidates", () => {
    const result = mapOpenBetaClimbRow({
      uuid: "climb-2",
      name: "Fallback Named Route",
      path_tokens: ["North America", "United States", "Colorado"],
      lat: 10,
      lng: 20,
    });
    expect(result).toMatchObject({
      row: {
        uuid: "climb-2",
        name: "Fallback Named Route",
        breadcrumb: ["North America", "United States", "Colorado"],
        latitude: 10,
        longitude: 20,
      },
    });
  });

  it("recognizes multiple discipline flag columns at once", () => {
    const result = mapOpenBetaClimbRow({
      climb_id: "climb-3",
      climb_name: "Mixed Route",
      country: "USA",
      is_sport: true,
      is_trad: true,
    });
    expect(result).toMatchObject({ row: { disciplines: ["sport", "trad"] } });
  });

  it("recognizes is_alpine/is_top_rope as real disciplines Betabook has no bucket for", () => {
    const result = mapOpenBetaClimbRow({
      climb_id: "climb-4",
      climb_name: "Alpine Route",
      country: "USA",
      is_alpine: true,
    });
    expect(result).toMatchObject({ row: { disciplines: ["alpine"] } });
  });

  it("skips a row with no recognizable uuid", () => {
    const result = mapOpenBetaClimbRow({ climb_name: "No Id" });
    expect(result).toEqual({ skipped: true, reason: "no recognizable uuid column" });
  });

  it("skips a row with no recognizable name", () => {
    const result = mapOpenBetaClimbRow({ climb_id: "climb-5" });
    expect(result).toMatchObject({ skipped: true });
  });

  it("skips a row with no recognizable location breadcrumb", () => {
    const result = mapOpenBetaClimbRow({ climb_id: "climb-6", climb_name: "No Location" });
    expect(result).toEqual({
      skipped: true,
      reason: 'climb climb-6 ("No Location") has no recognizable location breadcrumb',
    });
  });

  it("drops empty/missing breadcrumb levels rather than leaving hollow segments", () => {
    const result = mapOpenBetaClimbRow({
      climb_id: "climb-7",
      climb_name: "Sparse Location",
      country: "USA",
      state_province: "",
      area: "Some Area",
    });
    expect(result).toMatchObject({ row: { breadcrumb: ["USA", "Some Area"] } });
  });

  it("treats coordinates as absent rather than guessing when unparseable", () => {
    const result = mapOpenBetaClimbRow({
      climb_id: "climb-8",
      climb_name: "No Coords",
      country: "USA",
      latitude: "not a number",
    });
    expect(result).toMatchObject({ row: { latitude: null, longitude: null } });
  });

  it("falls back to flattened grade_<scale> columns", () => {
    const result = mapOpenBetaClimbRow({
      climb_id: "climb-9",
      climb_name: "Flattened Grades",
      country: "USA",
      grade_yds: "5.10a",
      grade_french: "6a",
    });
    expect(result).toMatchObject({ row: { grades: { yds: "5.10a", french: "6a" } } });
  });
});

describe("mapOpenBetaClimbRows", () => {
  it("separates mapped rows from skipped ones, keeping the original index", () => {
    const { rows, skipped } = mapOpenBetaClimbRows([
      { climb_id: "a", climb_name: "A", country: "USA" },
      { climb_name: "Missing Id", country: "USA" },
      { climb_id: "b", climb_name: "B", country: "USA" },
    ]);
    expect(rows.map((r) => r.uuid)).toEqual(["a", "b"]);
    expect(skipped).toEqual([{ index: 1, reason: "no recognizable uuid column" }]);
  });
});
