import { useEffect, useState } from "react";

import type { SearchCategory, SearchKind, SearchSection } from "@/components/search/search-types";
import type { ClimbRefinements } from "@/lib/filters/climb-refinements";
import { DEFAULT_CLIMB_REFINEMENTS } from "@/lib/filters/climb-refinements";

import { SAMPLE_AREAS, CATALOG_FIXTURES } from "./catalog-data";

export type SearchScenario =
  | "ready"
  | "initial"
  | "loading"
  | "empty"
  | "error"
  | "partial-error"
  | "long-name";

type Criteria = {
  query: string;
  category: SearchCategory;
  filters: ClimbRefinements;
  limit: number;
  onlySent: boolean;
  inherentAreaId?: string;
  pickerMode?: "logging" | "import" | "merge";
};

function matchesRating(rating: number | null | undefined, filters: ClimbRefinements) {
  if (filters.minRating > 1 && (rating ?? 0) < filters.minRating) return false;
  return (
    filters.maxRating === 0 ||
    filters.maxRating === 5 ||
    (rating != null && rating <= filters.maxRating)
  );
}

function fixtureSections(criteria: Criteria): SearchSection[] {
  const { query, category, filters, limit, onlySent, pickerMode, inherentAreaId } = criteria;
  const kinds: SearchKind[] = category === "all" ? ["climb", "area", "climber"] : [category];
  return kinds.map((kind) => {
    const items = CATALOG_FIXTURES.filter((item) => {
      if (item.kind !== kind || !item.name.toLowerCase().includes(query.trim().toLowerCase()))
        return false;
      if (kind !== "climb") return true;
      if (onlySent && !item.sent) return false;
      const areaId = inherentAreaId ?? filters.area?.id;
      if (areaId && item.areaId !== areaId && !(areaId === "area-1" && item.areaId === "area-11"))
        return false;
      if (!matchesRating(item.rating, filters)) return false;
      if (item.kind === "climb" && filters.disciplines.length > 0) {
        if (!filters.disciplines.includes(item.discipline)) return false;
        const range = filters[`${item.discipline}Range`];
        if (item.grade == null || item.grade < range[0] || item.grade > range[1]) return false;
      }
      return true;
    }).sort(
      (a, b) =>
        (a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) *
        (filters.sort === "name_asc" ? 1 : -1),
    );
    return {
      kind,
      status: category === "all" && !query.trim() ? "idle" : "ready",
      items: items.slice(0, limit).map((item) => ({
        ...item,
        disabledReason:
          pickerMode === "merge" && item.id === "climb-101" ? "Current climb" : undefined,
      })),
      hasMore: items.length > limit,
    };
  });
}

/** Story-only transport simulation. Cleanup drops superseded requests and pages. */
export function useSearchDemo({
  scenario = "ready",
  initialCategory = "all",
  limit = 5,
  onlySent = false,
  pickerMode,
  inherentAreaId,
}: {
  scenario?: SearchScenario;
  initialCategory?: SearchCategory;
  limit?: number;
  onlySent?: boolean;
  inherentAreaId?: string;
  pickerMode?: "logging" | "import" | "merge";
} = {}) {
  const [query, setQuery] = useState(
    scenario === "initial"
      ? ""
      : scenario === "empty"
        ? "zzzz"
        : scenario === "long-name"
          ? "very long"
          : pickerMode === "import"
            ? "Cedar Arete"
            : "cedar",
  );
  const [category, setCategory] = useState(initialCategory);
  const [filters, setFilters] = useState({
    ...DEFAULT_CLIMB_REFINEMENTS,
    area: pickerMode === "import" ? SAMPLE_AREAS[0] : null,
  });
  const [failed, setFailed] = useState<SearchKind[]>(
    scenario === "error"
      ? ["climb", "area", "climber"]
      : scenario === "partial-error"
        ? ["climber"]
        : [],
  );
  const [retried, setRetried] = useState(false);
  const [page, setPage] = useState({ key: "", extra: 0 });
  const baseKey = JSON.stringify({
    query,
    category,
    filters,
    onlySent,
    pickerMode,
    inherentAreaId,
  });
  const extra = page.key === baseKey ? page.extra : 0;
  const criteria: Criteria = {
    query,
    category,
    filters,
    onlySent,
    inherentAreaId,
    pickerMode,
    limit: limit + extra,
  };
  const key = JSON.stringify(criteria);
  const [settled, setSettled] = useState(() => ({ key, sections: fixtureSections(criteria) }));
  const [retrying, setRetrying] = useState<SearchKind[]>([]);
  const [retryVersion, setRetryVersion] = useState(0);
  const requestKey = `${key}:${retryVersion}`;
  const [answeredRequest, setAnsweredRequest] = useState(requestKey);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = JSON.parse(key) as Criteria;
      setSettled({ key, sections: fixtureSections(next) });
      setAnsweredRequest(requestKey);
      setRetrying([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [key, requestKey]);

  const pending = key !== settled.key || (scenario === "loading" && !retried);
  const expectedKinds: SearchKind[] =
    category === "all" ? ["climb", "area", "climber"] : [category];
  const sections = expectedKinds.map((kind): SearchSection => {
    const previous = settled.sections.find((section) => section.kind === kind);
    const status =
      pending || (requestKey !== answeredRequest && retrying.includes(kind))
        ? "loading"
        : failed.includes(kind)
          ? "error"
          : category === "all" && !query.trim()
            ? "idle"
            : "ready";
    return {
      kind,
      status,
      items: status === "idle" || status === "error" ? [] : (previous?.items ?? []),
      hasMore: !pending && previous?.hasMore,
    };
  });

  function retry(kind: SearchKind) {
    setRetrying((current) => [...current, kind]);
    setFailed((current) => current.filter((entry) => entry !== kind));
    setRetried(true);
    setRetryVersion((version) => version + 1);
  }

  function changeCategory(next: SearchCategory) {
    setCategory(next);
    if (next !== category) setFilters(DEFAULT_CLIMB_REFINEMENTS);
  }

  return {
    query,
    setQuery,
    category,
    changeCategory,
    filters,
    setFilters,
    sections,
    pending,
    retry,
    loadMore: () => {
      if (!pending) setPage({ key: baseKey, extra: extra + 4 });
    },
  };
}
