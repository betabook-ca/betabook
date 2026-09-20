"use client";

import { SearchField } from "@heroui/react";
import type { ComponentProps } from "react";

import { FIELD_HEIGHT_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";

export type QueryInputProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Replaces the standard long-field width — for the callers that share a
   * row with an adjacent action and need the field to take the remainder. */
  className?: string;
  inputProps?: Pick<
    ComponentProps<typeof SearchField.Input>,
    | "maxLength"
    | "autoFocus"
    | "onKeyDown"
    | "onKeyDownCapture"
    | "role"
    | "aria-controls"
    | "aria-expanded"
    | "aria-activedescendant"
    | "aria-autocomplete"
  >;
};

/** Shared field chrome. Search and filter consumers own their behavior and labels. */
export function QueryInput({
  value,
  onChange,
  label,
  placeholder,
  inputProps,
  className,
}: QueryInputProps) {
  return (
    <SearchField
      aria-label={label}
      value={value}
      onChange={onChange}
      className={className ?? FIELD_WIDTH_CLASS.long}
    >
      {/* Autofocus keeps typing immediate; only keyboard focus needs the outer ring. */}
      <SearchField.Group
        className={({ isFocusVisible }) =>
          `${FIELD_HEIGHT_CLASS} min-w-0 ${isFocusVisible ? "ring-2" : "ring-0"}`
        }
      >
        <SearchField.SearchIcon />
        {/* A flex item's default `min-width: auto` is its content width, so
         * without this the text pushes the clear button out past the field's
         * own rounded edge once the field has to share a row. */}
        <SearchField.Input
          className="min-w-0"
          placeholder={placeholder ?? label}
          autoComplete="off"
          {...inputProps}
        />
        <SearchField.ClearButton aria-label={`Clear ${label.toLowerCase()}`} />
      </SearchField.Group>
    </SearchField>
  );
}
