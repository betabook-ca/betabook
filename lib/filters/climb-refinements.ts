import type { SubtreeClimbsSort } from "@/db/queries";
import type { AreaSelection } from "@/lib/area-selection";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";

import { DEFAULT_DISCIPLINE_FILTER } from "./discipline-filter";

export type ClimbRefinements = DisciplineFilter & {
  area: AreaSelection | null;
  minRating: number;
  maxRating: number;
  sort: SubtreeClimbsSort;
};

export const DEFAULT_CLIMB_REFINEMENTS: ClimbRefinements = {
  ...DEFAULT_DISCIPLINE_FILTER,
  area: null,
  minRating: 0,
  maxRating: 0,
  sort: "name_asc",
};
