import type { SearchCategory } from "@/lib/search";
export type {
  SearchCategory,
  SearchKind,
  SearchResult,
  SearchSection,
  SearchStatus,
} from "@/lib/search";

export const SEARCH_LABELS: Record<SearchCategory, string> = {
  all: "All",
  climb: "Climbs",
  area: "Areas",
  climber: "Climbers",
};
