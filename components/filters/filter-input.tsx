"use client";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { QueryInput, type QueryInputProps } from "@/components/ui/query-input";

/** Narrows the list already on screen; it never opens a second results menu. */
export function FilterInput(props: QueryInputProps) {
  return <QueryInput {...props} />;
}

/** A filter toolbar's text box, at the standard search width. Pair it with
 * `textActiveFilters` so the "Text:" chip reads the same everywhere. */
export function TextFilterField(props: QueryInputProps) {
  return (
    <div className={FIELD_WIDTH_CLASS.long}>
      <FilterInput {...props} />
    </div>
  );
}
