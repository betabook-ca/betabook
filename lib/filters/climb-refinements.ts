import type { SubtreeClimbsSort } from "@/db/queries";
import type { AreaSelection } from "@/lib/area-selection";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";

export type ClimbRefinements = DisciplineFilter & {
  area: AreaSelection | null;
  minRating: number;
  maxRating: number;
  sort: SubtreeClimbsSort;
};
