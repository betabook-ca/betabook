"use client";

import { useState } from "react";

import { useSearchLookup, type LookupFetcher } from "@/hooks/use-search-lookup";
import type { AreaSelection } from "@/lib/area-selection";
import { fetchAreaSuggestions, type AreaSuggestion } from "@/lib/search-suggestions";

import { SearchSelectionField } from "./search-selection-field";

export function AreaLookup({
  value,
  onChange,
  label = "In area",
  hideLabel = false,
  placeholder,
  defaultQuery = "",
  isInvalid = false,
  isRequired = false,
  validationError,
  fetcher = fetchAreaSuggestions,
}: {
  fetcher?: LookupFetcher<AreaSuggestion>;
  value: AreaSelection | null;
  onChange: (area: AreaSelection | null) => void;
  label?: string;
  hideLabel?: boolean;
  placeholder?: string;
  defaultQuery?: string;
  isInvalid?: boolean;
  validationError?: string;
  isRequired?: boolean;
}) {
  const [query, setQuery] = useState(value?.name ?? defaultQuery);
  const [identity, setIdentity] = useState(value?.id);
  if (identity !== value?.id) {
    setIdentity(value?.id);
    setQuery(value?.name ?? "");
  }
  const lookup = useSearchLookup({ query, fetcher });
  return (
    <SearchSelectionField
      label={label}
      hideLabel={hideLabel}
      placeholder={placeholder}
      query={query}
      selectedId={value?.id}
      isInvalid={isInvalid}
      isRequired={isRequired}
      validationError={validationError}
      status={lookup.status}
      onRetry={lookup.retry}
      items={lookup.items.map((area) => ({
        kind: "area",
        id: String(area.id),
        name: area.name,
        detail: area.ancestorPath ?? "Area",
      }))}
      onQueryChange={(next) => {
        setQuery(next);
        if (value && next !== value.name) {
          setIdentity(undefined);
          onChange(null);
        }
      }}
      onSelect={(item) => {
        setQuery(item.name);
        setIdentity(item.id);
        onChange({ id: item.id, name: item.name, path: item.detail });
      }}
    />
  );
}
