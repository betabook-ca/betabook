"use client";
import { QueryInput, type QueryInputProps } from "@/components/ui/query-input";

/** A query used to find records to open or select. */
export function SearchInput(props: QueryInputProps) {
  return <QueryInput {...props} />;
}
