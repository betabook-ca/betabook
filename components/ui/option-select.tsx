"use client";

import { ListBox, Select } from "@heroui/react";

export type SelectOption<V extends string> = { value: V; label: string };

/** A dropdown over a fixed list of value/label pairs — HeroUI's Select in
 * the same trigger/popover shape the send form's grade picker uses, so a
 * dropdown in the import wizard looks like one anywhere else. Native
 * `<select>` was the alternative, and its browser-drawn arrow sits flush
 * against the field's edge. */
export function OptionSelect<V extends string>({
  ariaLabel,
  isRequired,
  value,
  onChange,
  options,
  className,
}: {
  ariaLabel: string;
  isRequired?: boolean;
  value: V;
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  className?: string;
}) {
  return (
    <div className={className}>
      <Select
        aria-label={ariaLabel}
        isRequired={isRequired}
        fullWidth
        selectedKey={value}
        onSelectionChange={(key) => {
          if (key != null) onChange(String(key) as V);
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox className="max-h-64 overflow-y-auto">
            {options.map((option) => (
              <ListBox.Item key={option.value} id={option.value}>
                {option.label}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
