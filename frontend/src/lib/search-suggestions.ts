import { DEFAULT_SUGGESTION_LIMIT } from "@/lib/url-params";
import { fetchApi } from "@/spa/lib/api";

export type AreaSuggestion = {
  id: number;
  name: string;
  /** Root-first, " / "-joined — the same reading as `AreaBreadcrumb`, so
   * "where is this" looks identical in a popover and in a result row. Null
   * for a root area, which has no ancestors to place it under. */
  ancestorPath: string | null;
};

/** `searchAreas` already returns `ancestorPath` root-first; this only swaps
 * its " > " for the " / " every rendered breadcrumb uses, so a suggestion row
 * and a result row look like the same thing. */
export function toBreadcrumbPath(ancestorPath: string | null): string | null {
  if (!ancestorPath) return null;
  return ancestorPath.split(" > ").join(" / ") || null;
}

export async function fetchAreaSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<AreaSuggestion[]> {
  const params = new URLSearchParams({ name: query, limit: String(DEFAULT_SUGGESTION_LIMIT) });

  const data = await fetchApi("/api/public/search/areas", {
    query: params,
    signal,
    sessionEvents: true,
  });
  return data.areas.map((area) => ({
    id: area.id,
    name: area.name,
    ancestorPath: toBreadcrumbPath(area.ancestorPath),
  }));
}
