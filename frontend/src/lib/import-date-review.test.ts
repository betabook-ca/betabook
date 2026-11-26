import { expect, it } from "vitest";

import { findImportDateClusters } from "./import-date-review";

const rows = (dateSent: string | null, count: number) =>
  Array.from({ length: count }, () => ({ dateSent }));
it("flags the example profile's 49 out of 60 sends on one day", () => {
  expect(
    findImportDateClusters([
      ...rows("2025-09-03", 49),
      ...rows("2026-03-18", 9),
      ...rows("2026-03-14", 2),
    ]),
  ).toEqual([{ date: "2025-09-03", count: 49, datedCount: 60 }]);
});
it("ignores small sessions and dates below a quarter of dated rows", () => {
  expect(findImportDateClusters(rows("2025-09-03", 19))).toEqual([]);
  const spread = Array.from({ length: 81 }, (_, i) => ({
    dateSent: `2025-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  expect(findImportDateClusters([...rows("2026-01-01", 20), ...spread])).toEqual([]);
});
it("flags every qualifying day and excludes undated rows from the denominator", () => {
  expect(
    findImportDateClusters([
      ...rows("2025-09-03", 30),
      ...rows("2026-03-18", 25),
      ...rows("2026-03-14", 5),
      ...rows(null, 100),
    ]),
  ).toEqual([
    { date: "2025-09-03", count: 30, datedCount: 60 },
    { date: "2026-03-18", count: 25, datedCount: 60 },
  ]);
});
it("includes the 20-send and 25-percent boundaries without mutating rows", () => {
  const input = [...rows("2025-09-03", 60), ...rows("2026-03-18", 20)];
  const original = structuredClone(input);
  expect(findImportDateClusters(input)).toEqual([
    { date: "2025-09-03", count: 60, datedCount: 80 },
    { date: "2026-03-18", count: 20, datedCount: 80 },
  ]);
  expect(input).toEqual(original);
  expect(findImportDateClusters(rows(null, 30))).toEqual([]);
});
