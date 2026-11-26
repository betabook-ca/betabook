type SortDirection = "asc" | "desc";

type UseSortToggleOptions<Field extends string, Sort extends string> = {
  sort: Sort;
  fields: readonly Field[];
  /** Fallback field when `sort` doesn't match any of `fields` (shouldn't
   * happen in practice, but sort strings round-trip through the URL). */
  defaultField: Field;
  /** Direction a freshly-picked field starts at — flipping direction on an
   * already-active field is handled separately, by the arrow button. */
  defaultDirection: Record<Field, SortDirection>;
  navigate: (sort: Sort) => void;
};

/** Field and direction state for a "field dropdown + direction arrow" sort
 * control, over sort strings shaped `${field}_${direction}`. */
export function useSortToggle<Field extends string, Sort extends string>({
  sort,
  fields,
  defaultField,
  defaultDirection,
  navigate,
}: UseSortToggleOptions<Field, Sort>) {
  function toSort(field: Field, direction: SortDirection): Sort {
    return `${field}_${direction}` as Sort;
  }

  function directionOf(value: Sort): SortDirection {
    return value.endsWith("_asc") ? "asc" : "desc";
  }

  // Exact field match (a field that happens to prefix another must not
  // shadow it), by rebuilding each candidate's two sort strings rather than
  // prefix-matching the raw sort.
  const field =
    fields.find((f) => sort === toSort(f, "asc") || sort === toSort(f, "desc")) ?? defaultField;
  const direction = directionOf(sort);

  function handleFieldChange(nextField: Field) {
    const nextDirection = field === nextField ? direction : defaultDirection[nextField];
    navigate(toSort(nextField, nextDirection));
  }

  function toggleDirection() {
    navigate(toSort(field, direction === "asc" ? "desc" : "asc"));
  }

  return { field, direction, handleFieldChange, toggleDirection };
}
