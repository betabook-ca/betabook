import { expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";

import { selectChartSends, sendChartRows } from "./chart-details";

it("sends only selected chart data across the client boundary", () => {
  const row: AnalyticsSendRow = {
    climbId: 1,
    climbName: "Selected climb",
    climbType: "boulder",
    suggestedGrade: 4,
    dateSent: "2025-06-01",
    areaId: 123,
    areaName: "An area not used in the chart",
    ascentStyle: "flash",
  };
  const rows: AnalyticsSendRow[] = [
    row,
    { ...row, climbId: 2, dateSent: null },
    { ...row, climbId: 3, dateSent: "2024-06-01" },
    { ...row, climbId: 4, climbType: "sport" },
  ];
  const selected = selectChartSends(rows, "boulder", [2025]);
  expect(sendChartRows(selected)).toEqual([
    { id: "send-1", climbId: 1, climbName: "Selected climb", date: "2025-06-01" },
  ]);
  expect(selected[0].suggestedGrade).toBe(4);
  expect(selected[0]).not.toHaveProperty("areaName");
  expect(selected[0]).not.toHaveProperty("areaId");
  expect(selected[0]).not.toHaveProperty("ascentStyle");
  expect(selectChartSends(rows, "boulder", []).map((send) => send.climbId)).toEqual([1, 2, 3]);
  expect(row.areaId).toBe(123);
});
