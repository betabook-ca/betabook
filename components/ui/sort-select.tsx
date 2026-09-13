"use client";

import { Button, Label, ListBox, Select } from "@heroui/react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { FIELD_ACTION_CLASS, FIELD_SURFACE_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { useSortToggle } from "@/hooks/use-sort-toggle";

/** The field-dropdown + direction-arrow-button sort control shared by every
 * sortable list (climb search, the area page, the user sends list) — same
 * JSX, differing only in which fields are offered. Owns only the widget;
 * callers own navigation, same as `useSortToggle` underneath it. */
export function SortSelect<Field extends string, Sort extends string>({
  sort,
  fields,
  defaultField,
  defaultDirection,
  onNavigate,
}: {
  sort: Sort;
  fields: readonly { id: Field; label: string }[];
  defaultField: Field;
  defaultDirection: Record<Field, "asc" | "desc">;
  onNavigate: (sort: Sort) => void;
}) {
  const { field, direction, handleFieldChange, toggleDirection } = useSortToggle({
    sort,
    fields: fields.map((f) => f.id),
    defaultField,
    defaultDirection,
    navigate: onNavigate,
  });

  return (
    <div className="flex items-center gap-2">
      <Select
        className="flex-row items-center gap-2"
        selectedKey={field}
        onSelectionChange={(key) => handleFieldChange(key as Field)}
      >
        {/* Hidden only inside a narrow filter toolbar, where sort shares the search row. */}
        <Label className="shrink-0 text-xs text-muted @max-2xl/filters:sr-only">Sort by</Label>
        <Select.Trigger className={FIELD_WIDTH_CLASS.short}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {fields.map(({ id, label }) => (
              <ListBox.Item key={id} id={id}>
                {label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Button
        isIconOnly
        variant="ghost"
        className={`${FIELD_ACTION_CLASS} ${FIELD_SURFACE_CLASS}`}
        aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"}
        onPress={toggleDirection}
      >
        {direction === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
      </Button>
    </div>
  );
}
