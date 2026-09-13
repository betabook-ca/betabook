import type { ClimberOverview } from "@/db/queries/climber-overview";
import { buildSeason } from "@/lib/climber-season";

const TODAY = "2026-09-04";

const WEEKLY_DAYS = [
  0, 1, 1, 2, 2, 3, 2, 1, 0, 0, 1, 2, 3, 3, 4, 3, 2, 2, 1, 1, 0, 0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 4, 3,
  3, 2, 2, 1, 1, 0, 1, 2, 2, 3, 3, 4, 3, 2, 1, 1, 2, 3, 2,
];

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
  season: buildSeason([], TODAY).map((week, index) => ({ ...week, days: WEEKLY_DAYS[index] })),
};

export const STORY_NEW_CLIMBER_OVERVIEW: ClimberOverview = {
  sendCount: 0,
  areaCount: 0,
  hardest: [],
  firstYear: null,
  daysOut: 0,
  season: buildSeason([], TODAY),
};
