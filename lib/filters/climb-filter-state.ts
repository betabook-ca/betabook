import type { SubtreeClimbsSort } from "@/db/queries";
import type { AreaSelection } from "@/lib/area-selection";

import type { ClimbFilter } from "./climb-filter";

export type ClimbFilterState = {
  filter: ClimbFilter;
  sort: SubtreeClimbsSort;
  area: AreaSelection | null;
};

export function withClimbFilterArea<T extends ClimbFilterState>(
  state: T,
  area: AreaSelection | null,
): T {
  return {
    ...state,
    area,
    filter: { ...state.filter, areaId: area ? Number(area.id) : undefined, areaName: undefined },
  };
}
