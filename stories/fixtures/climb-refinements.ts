import type { ClimbRefinements } from "@/lib/filters/climb-refinements";
import { DEFAULT_DISCIPLINE_FILTER } from "@/lib/filters/discipline-filter";

export const DEFAULT_CLIMB_REFINEMENTS: ClimbRefinements = {
  ...DEFAULT_DISCIPLINE_FILTER,
  area: null,
  minRating: 0,
  maxRating: 0,
  sort: "name_asc",
};
