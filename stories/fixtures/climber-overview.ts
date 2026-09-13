import type { ClimberOverview } from "@/db/queries/climber-overview";

export const STORY_CLIMBER_OVERVIEW: ClimberOverview = {
  sendCount: 214,
  areaCount: 18,
  hardest: [
    { type: "boulder", grade: "V8", sendCount: 151 },
    { type: "sport", grade: "5.12b", sendCount: 58 },
    { type: "trad", grade: "5.9", sendCount: 5 },
  ],
  firstYear: 2019,
  daysOut: 412,
  lastOut: "2026-09-01",
  daysThisMonth: 3,
  month: "2026-09",
};

export const STORY_NEW_CLIMBER_OVERVIEW: ClimberOverview = {
  sendCount: 0,
  areaCount: 0,
  hardest: [],
  firstYear: null,
  daysOut: 0,
  lastOut: null,
  daysThisMonth: 0,
  month: "2026-09",
};
