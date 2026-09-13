import type { AnalyticsSendRow } from "@/db/queries";
import type { ChartSession } from "@/lib/chart-details";
import { buildUserAnalytics } from "@/lib/user-analytics";

export const activitySends: AnalyticsSendRow[] = [
  ["Cedar Arete", "2026-01-02", 3, "flash"],
  ["Moss Garden", "2026-01-02", 3, "flash"],
  ["Quiet Corner", "2026-01-03", 3, "redpoint"],
  ["Granite Steps", "2026-02-02", 4, "flash"],
  ["Evening Light", "2026-02-02", 4, "redpoint"],
  ["The Long Way Home", "2026-02-02", 4, "redpoint"],
  ["River Stone", "2026-02-02", 4, "redpoint"],
  ["Spring Slab", "2026-03-04", 5, "flash"],
  ["Forgotten Date", null, 4, "redpoint"],
].map(([climbName, dateSent, suggestedGrade, ascentStyle], i) => ({
  climbId: i + 1,
  climbName: String(climbName),
  dateSent: dateSent == null ? null : String(dateSent),
  suggestedGrade: Number(suggestedGrade),
  ascentStyle: ascentStyle as AnalyticsSendRow["ascentStyle"],
  climbType: "boulder",
  areaId: 1,
  areaName: "Forestland",
}));

export const activitySessions: ChartSession[] = [
  ...activitySends.flatMap((send) =>
    send.dateSent
      ? [
          {
            id: send.climbId,
            climbId: send.climbId,
            climbName: send.climbName,
            climbType: send.climbType,
            entryDate: send.dateSent,
            sent: true,
            isAscent: true,
          },
        ]
      : [],
  ),
  {
    id: 10,
    climbId: 1,
    climbName: "Cedar Arete",
    climbType: "boulder",
    entryDate: "2026-01-10",
    sent: true,
    isAscent: false,
  },
  {
    id: 11,
    climbId: 1,
    climbName: "Cedar Arete",
    climbType: "boulder",
    entryDate: "2026-01-11",
    sent: true,
    isAscent: false,
  },
  {
    id: 12,
    climbId: 20,
    climbName: "Winter Project",
    climbType: "boulder",
    entryDate: "2026-01-02",
    sent: false,
    isAscent: false,
  },
];

export const activityAnalytics = buildUserAnalytics(
  activitySends,
  "boulder",
  activitySessions.map((session) => ({
    entryDate: session.entryDate,
    climbType: session.climbType,
  })),
);
