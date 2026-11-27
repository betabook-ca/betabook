"use client";

import { useState } from "react";

import { useReportNavigationPending } from "@/components/navigation-pending";
import { useDebouncedReplace } from "@/hooks/use-debounced-replace";

/** Keep local edits responsive while the URL owns committed filter state.
 * External URL changes reseed the form; its own navigations preserve typing. */
export function useFilterFormNavigation<T, Sort extends string = string>({
  initialFilter,
  initialName = "",
  initialAreaName = "",
  defaultFilter,
  sort,
  defaultSort,
  buildHref,
}: {
  initialFilter: T;
  initialName?: string;
  initialAreaName?: string;
  defaultFilter: T;
  /** Filter changes preserve sort; reset uses defaultSort. */
  sort?: Sort;
  defaultSort?: Sort;
  buildHref: (filter: T, name: string, areaName: string, sort: Sort | undefined) => string;
}) {
  const [name, setName] = useState(initialName);
  const [areaName, setAreaName] = useState(initialAreaName);
  const [filter, setFilter] = useState(initialFilter);
  // Reset overrides the external sort prop until that prop changes. Independent
  // sort navigation can still race a pending reset.
  const [sortOverride, setSortOverride] = useState<Sort | null>(null);
  const [prevSort, setPrevSort] = useState(sort);
  if (prevSort !== sort) {
    // Clear during render so a stale href cannot reach the debounce effect.
    setPrevSort(sort);
    setSortOverride(null);
  }

  // Use the URL's sort prop for comparison, not the pending reset override.
  const currentHref = buildHref(initialFilter, initialName, initialAreaName, sort);
  const { isPending, urlChangedExternally } = useDebouncedReplace(
    buildHref(filter, name, areaName, sortOverride ?? sort),
    currentHref,
  );

  // Adopt external filter changes without remounting inputs or losing focus.
  // Ignore sort-only changes so they preserve text still inside the debounce window.
  const fingerprint = buildHref(initialFilter, initialName, initialAreaName, defaultSort);
  const [prevFingerprint, setPrevFingerprint] = useState(fingerprint);
  const nonSortValuesChanged = fingerprint !== prevFingerprint;
  if (nonSortValuesChanged) setPrevFingerprint(fingerprint);
  if (urlChangedExternally && nonSortValuesChanged) {
    setName(initialName);
    setAreaName(initialAreaName);
    setFilter(initialFilter);
  }

  useReportNavigationPending(isPending);

  function reset() {
    setName("");
    setAreaName("");
    setFilter(defaultFilter);
    if (defaultSort !== undefined) setSortOverride(defaultSort);
  }

  /** Call when the reader picks a sort, alongside the caller's own
   * navigation to it. Until the URL's sort changes, this hook's debounced
   * navigation builds on the chosen sort, so text still being typed follows
   * it instead of writing the old sort back. */
  function holdSort(next: Sort) {
    setSortOverride(next);
  }

  return {
    name,
    setName,
    areaName,
    setAreaName,
    filter,
    setFilter,
    reset,
    holdSort,
    isPending,
    /** The sort to show: one just chosen, else the URL's. */
    sort: sortOverride ?? sort,
  };
}
