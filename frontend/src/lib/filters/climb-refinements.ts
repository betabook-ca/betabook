import type { AreaSelection } from "@/lib/area-selection";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";

/** What ClimbFilters itself reads and writes: the disciplines and grade
 * ranges, plus the area scope. Rating and sort belong to the caller. */
export type ClimbRefinements = DisciplineFilter & { area: AreaSelection | null };
