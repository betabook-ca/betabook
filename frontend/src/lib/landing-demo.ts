import type { AnalyticsSendRow } from "@/db/queries";
import { nativeGradeArray } from "@/lib/grades";
import { buildUserAnalytics } from "@/lib/user-analytics";

/** A fictional climber's boulders for the logbook page preview. The IDs are
 * negative samples that must never reach links or writes. */
const HISTORY: [dateSent: string, grade: string, climbName: string, flash?: true][] = [
  ["2024-04-13", "V1", "Lichen Slab", true],
  ["2024-05-04", "V2", "First Light"],
  ["2024-05-18", "V2", "Tea Kettle", true],
  ["2024-06-08", "V3", "Moss Ladder"],
  ["2024-07-20", "V2", "Low Tide", true],
  ["2024-08-10", "V3", "Split Decision"],
  ["2024-09-14", "V4", "Quiet Arete"],
  ["2024-10-05", "V3", "Cedar Crack", true],
  ["2025-03-22", "V4", "Long Shadow"],
  ["2025-04-19", "V3", "Granite Stairs", true],
  ["2025-05-10", "V5", "The Long Way"],
  ["2025-06-07", "V4", "Birch Prow"],
  ["2025-07-12", "V4", "Fern Gully", true],
  ["2025-08-23", "V5", "Hollow Log"],
  ["2025-09-20", "V3", "Sunny Side", true],
  ["2025-10-11", "V6", "Night Shift"],
  ["2026-04-04", "V5", "Second Wind", true],
  ["2026-05-16", "V4", "Rain Check"],
  ["2026-06-13", "V6", "High Water"],
  ["2026-07-25", "V5", "Pine Needle"],
  ["2026-08-22", "V7", "Last Light"],
];

export const LANDING_DEMO_SENDS: AnalyticsSendRow[] = HISTORY.map(
  ([dateSent, grade, climbName, flash], index) => ({
    climbId: -(index + 1),
    climbName,
    climbType: "boulder",
    suggestedGrade: nativeGradeArray("boulder").indexOf(grade),
    areaId: -1,
    areaName: "Pine Canyon",
    ascentStyle: flash ? "flash" : "redpoint",
    dateSent,
  }),
);

export const LANDING_DEMO_ANALYTICS = buildUserAnalytics(LANDING_DEMO_SENDS, "boulder");
