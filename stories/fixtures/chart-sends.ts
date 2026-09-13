import type { AnalyticsSendRow } from "@/db/queries";
import type { ClimbType } from "@/lib/grades";

export function chartSends(
  count: number,
  grade: number,
  type: ClimbType = "boulder",
  month = "2026-09",
): AnalyticsSendRow[] {
  const names = [
    "Cedar Arete",
    "The Long Way Home",
    "Moss Garden",
    "Quiet Corner",
    "Granite Steps",
    "Evening Light",
  ];
  return Array.from({ length: count }, (_, i) => ({
    climbId: grade * 100 + i + 1,
    climbName: names[i % names.length] + (i >= names.length ? ` ${i + 1}` : ""),
    climbType: type,
    suggestedGrade: grade,
    areaId: 1,
    areaName: "Forestland",
    ascentStyle: "redpoint",
    dateSent: `${month}-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
}
