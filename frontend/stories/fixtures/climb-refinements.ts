import type { SubtreeClimbsSort } from "@/lib/climb-list-sort";
import type { ClimbRefinements } from "@/lib/filters/climb-refinements";
import { DEFAULT_DISCIPLINE_FILTER } from "@/lib/filters/discipline-filter";

/** The gallery's demo filter state: ClimbFilters' refinements plus the rating
 * and sort the demo keeps beside them. */
export type DemoClimbRefinements = ClimbRefinements & {
  minRating: number;
  maxRating: number;
  sort: SubtreeClimbsSort;
};

export const DEFAULT_CLIMB_REFINEMENTS: DemoClimbRefinements = {
  ...DEFAULT_DISCIPLINE_FILTER,
  area: null,
  minRating: 0,
  maxRating: 0,
  sort: "name_asc",
};
