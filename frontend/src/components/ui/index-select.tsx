"use client";

import { ListBox, Select } from "@heroui/react";

import { FIELD_WIDTH_CLASS, FILTER_ROW_CLASS, FILTER_LABEL_CLASS } from "@/components/ui/field";

type IndexSelectProps = {
  label: string;
  options: readonly string[];
  index: number;
  onChange: (index: number) => void;
};

/** A `Select` whose selection is an index into `options`, rather than the
 * option's own value — shared by every "discrete-step dropdown" (grade,
 * rating, ...) in the app. */
function IndexSelect({ label, options, index, onChange }: IndexSelectProps) {
  return (
    <Select
      aria-label={label}
      selectedKey={String(index)}
      onSelectionChange={(key) => onChange(Number(key))}
    >
      <Select.Trigger className={FIELD_WIDTH_CLASS.short}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- selection by array index
            <ListBox.Item key={i} id={String(i)}>
              {option}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

type IndexRangeSelectProps = {
  label: string;
  options: readonly string[];
  minLabel: string;
  maxLabel: string;
  range: [number, number];
  onChange: (range: [number, number]) => void;
};

/** A min/max pair of `IndexSelect`s, clamped so min never exceeds max. */
export function IndexRangeSelect({
  label,
  options,
  minLabel,
  maxLabel,
  range,
  onChange,
}: IndexRangeSelectProps) {
  return (
    <div className={FILTER_ROW_CLASS} role="group" aria-label={`${label} range`}>
      <span className={FILTER_LABEL_CLASS}>{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <IndexSelect
          label={minLabel}
          options={options}
          index={range[0]}
          onChange={(min) => onChange([min, Math.max(min, range[1])])}
        />
        <span className="text-muted">–</span>
        <IndexSelect
          label={maxLabel}
          options={options}
          index={range[1]}
          onChange={(max) => onChange([Math.min(range[0], max), max])}
        />
      </div>
    </div>
  );
}
