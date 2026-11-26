"use client";

import { SortSelect } from "@/components/ui/sort-select";
import type { SubtreeClimbsSort } from "@/db/queries";

type SortField = "name" | "grade" | "rating" | "ascents";

const SORT_FIELDS: { id: SortField; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "grade", label: "Grade" },
  { id: "rating", label: "Rating" },
  { id: "ascents", label: "Ascents" },
];

// Alphabetical/hardest/highest-rated/most-sent first by default when a
// field is picked fresh — direction only flips via the separate arrow
// button once a field is already active.
const DEFAULT_DIRECTION: Record<SortField, "asc" | "desc"> = {
  name: "asc",
  grade: "desc",
  rating: "desc",
  ascents: "desc",
};

export function ClimbListSortControl({
  sort,
  onNavigate,
}: {
  sort: SubtreeClimbsSort;
  onNavigate: (sort: SubtreeClimbsSort) => void;
}) {
  return (
    <SortSelect
      sort={sort}
      fields={SORT_FIELDS}
      defaultField="ascents"
      defaultDirection={DEFAULT_DIRECTION}
      onNavigate={onNavigate}
    />
  );
}
