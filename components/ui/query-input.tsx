"use client";

import { SearchField } from "@heroui/react";
import type { ComponentProps } from "react";

import { FIELD_HEIGHT_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";

export type QueryInputProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
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
export function QueryInput({ value, onChange, label, placeholder, inputProps }: QueryInputProps) {
  return (
    <SearchField
      aria-label={label}
      value={value}
      onChange={onChange}
      className={FIELD_WIDTH_CLASS.long}
    >
      {/* Autofocus keeps typing immediate; only keyboard focus needs the outer ring. */}
      <SearchField.Group
        className={({ isFocusVisible }) =>
          `${FIELD_HEIGHT_CLASS} ${isFocusVisible ? "ring-2" : "ring-0"}`
        }
      >
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder ?? label} autoComplete="off" {...inputProps} />
        <SearchField.ClearButton aria-label={`Clear ${label.toLowerCase()}`} />
      </SearchField.Group>
    </SearchField>
  );
}
