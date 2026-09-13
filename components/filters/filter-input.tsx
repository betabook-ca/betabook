"use client";
import { QueryInput, type QueryInputProps } from "@/components/ui/query-input";

/** Narrows the list already on screen; it never opens a second results menu. */
export function FilterInput(props: QueryInputProps) {
  return <QueryInput {...props} />;
}
