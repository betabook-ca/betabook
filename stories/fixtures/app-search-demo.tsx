import { Button } from "@heroui/react";
import { useState } from "react";

import { ClimbPicker } from "@/components/climb-picker";
import { FriendshipActionButton } from "@/components/friendship-action-button";
import { SearchController } from "@/components/search/search-controller";
import {
  climberSuggestionItems,
  EMPTY_SEARCH,
  searchHref,
  type AppSearchResult,
  type SearchFetcher,
  type SearchKind,
  type SearchState,
} from "@/lib/search";

import { SAMPLE_AREAS, CATALOG_FIXTURES, type SearchFixture } from "./catalog-data";
import { StoryPage } from "./story-layout";

export const searchAreaFetcher = async (query: string) =>
  SAMPLE_AREAS.filter((area) => area.name.toLowerCase().includes(query.toLowerCase())).map(
    (area) => ({
      id: Number(area.id.replace("area-", "")),
      name: area.name,
      ancestorPath: area.path,
    }),
  );

/** Replaces only the network. Debounce, stale protection, retry, and pagination run in the production hook. */
function createSearchFixtureFetcher({
  failKind,
  failPage = false,
  publicOnly = false,
}: { failKind?: SearchKind; failPage?: boolean; publicOnly?: boolean } = {}): SearchFetcher {
  let failed = false;
  let pageFailed = false;
  return async (state, kind, page, signal) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 40);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Aborted"));
        },
        { once: true },
      );
    });
    if (kind === failKind && !failed) {
      failed = true;
      throw new Error("Sample failure");
    }
    if (page > 1 && failPage && !pageFailed) {
      pageFailed = true;
      throw new Error("Sample page failure");
    }
    const matches = CATALOG_FIXTURES.filter((item) => {
      if (item.kind !== kind || !item.name.toLowerCase().includes(state.query.trim().toLowerCase()))
        return false;
      if (item.kind !== "climb") return true;
      const area = state.filter.areaId;
      if (
        area !== undefined &&
        item.areaId !== `area-${area}` &&
        !(area === 1 && item.areaId === "area-11")
      )
        return false;
      const [min, max] = state.filter.ratingRange;
      if ((min > 0 && (item.rating ?? 0) < min) || (max > 0 && (item.rating ?? 0) > max))
        return false;
      if (state.filter.disciplines.length) {
        const range = state.filter[`${item.discipline}Range`];
        if (
          !state.filter.disciplines.includes(item.discipline) ||
          item.grade === null ||
          item.grade < range[0] ||
          item.grade > range[1]
        )
          return false;
      }
      return true;
    }).sort((a, b) => {
      // Mirrors searchClimbs's ORDER BY: the chosen field leads, name and id
      // break ties. Every fixture climb shares one ascent count, so the
      // default ascents sort ties straight into the name tie-break.
      const sortValue = (item: SearchFixture) =>
        item.kind !== "climb"
          ? 0
          : state.sort.startsWith("grade")
            ? (item.grade ?? 0)
            : state.sort.startsWith("rating")
              ? (item.rating ?? 0)
              : 0;
      const lead = state.sort.startsWith("name")
        ? a.name.localeCompare(b.name)
        : sortValue(a) - sortValue(b);
      return (
        lead * (state.sort.endsWith("_desc") ? -1 : 1) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    });
    const items = matches.slice((page - 1) * 5, page * 5).map((item): AppSearchResult => ({
      ...item,
      href: "",
      // The public catalog returns names, hierarchy, discipline and grade
      // only — a signed-out story must not paint ratings or ascent counts.
      ...(item.kind === "climb"
        ? {
            climb: {
              id: Number(item.id.replace("climb-", "")),
              name: item.name,
              areaId: Number(item.areaId?.replace("area-", "")),
              areaName: "Cedar Grove",
              type: item.discipline,
              grade: item.grade,
            },
            ...(publicOnly
              ? {}
              : {
                  stats: { avgRating: item.rating ?? null, sendCount: 2 },
                  context: { ancestors: [], sendCount: 2, sent: item.sent ?? false },
                }),
          }
        : {}),
    }));
    return { items, hasMore: matches.length > page * 5, nextPage: page + 1 };
  };
}

const SUGGESTED_CLIMBERS = climberSuggestionItems([
  {
    id: "suggested-1",
    name: "Sam Rivera",
    image: null,
    friendshipStatus: "none",
    mutualFriendCount: 2,
  },
  {
    id: "suggested-2",
    name: "Jordan Park",
    image: null,
    friendshipStatus: "none",
    mutualFriendCount: 1,
  },
]).map((item) => ({ ...item, href: "" }));

function DemoFriendAction({ name }: { name: string }) {
  const [requested, setRequested] = useState(false);
  return (
    <FriendshipActionButton
      action={requested ? "cancel" : "add"}
      name={name}
      onPress={(complete) => {
        setRequested(!requested);
        complete();
      }}
    />
  );
}

function Selection({ selected }: { selected: AppSearchResult | null }) {
  return selected ? (
    <output aria-label="Selected record" data-selected-id={selected.id} className="block text-sm">
      Selected: {selected.name}
      <span className="block text-xs text-muted">{selected.detail}</span>
    </output>
  ) : null;
}

export function IntegratedSearchDemo({
  surface = "full",
  failure = false,
  pageFailure = false,
  initialQuery = "cedar",
  initialCategory = "all",
  initialOpen = false,
  publicOnly = false,
  suggestions = false,
}: {
  surface?: "quick" | "full" | "journey";
  failure?: boolean;
  pageFailure?: boolean;
  initialQuery?: string;
  initialCategory?: SearchState["category"];
  initialOpen?: boolean;
  publicOnly?: boolean;
  suggestions?: boolean;
}) {
  const [state, setState] = useState<SearchState>({
    ...EMPTY_SEARCH,
    query: initialQuery,
    category: initialCategory,
  });
  const [open, setOpen] = useState(initialOpen);
  const [full, setFull] = useState(surface === "full");
  const [selected, setSelected] = useState<AppSearchResult | null>(null);
  const [fetcher] = useState(() =>
    createSearchFixtureFetcher({
      failKind: failure ? "climber" : undefined,
      failPage: pageFailure,
      publicOnly,
    }),
  );
  return (
    <StoryPage
      title={
        surface === "journey" ? "Search journey" : surface === "quick" ? "Quick search" : "Search"
      }
      description="Integrated app controller with deterministic sample responses and local navigation."
    >
      {!full && (
        <Button variant="outline" onPress={() => setOpen(true)}>
          Search Betabook
        </Button>
      )}
      <SearchController
        state={state}
        onChange={setState}
        fetcher={fetcher}
        publicOnly={publicOnly}
        suggestions={suggestions ? SUGGESTED_CLIMBERS : undefined}
        renderAction={
          suggestions
            ? (item) => (item.climber ? <DemoFriendAction name={item.name} /> : null)
            : undefined
        }
        quick={!full}
        isOpen={full || open}
        onOpenChange={setOpen}
        suggestedArea={
          !full ? { id: "1", name: "Cedar Grove", path: "California / North Woods" } : undefined
        }
        onExpand={() => {
          setOpen(false);
          setFull(true);
        }}
        onNavigate={(item) => {
          setSelected(item);
          setOpen(false);
        }}
      />
      <Selection selected={selected} />
      <output className="sr-only" aria-label="Search URL">
        {searchHref(state)}
      </output>
    </StoryPage>
  );
}

export function IntegratedClimbPickerDemo({
  mode = "logging",
  initialQuery = "cedar",
}: {
  mode?: "logging" | "import" | "merge";
  initialQuery?: string;
}) {
  const [selected, setSelected] = useState<AppSearchResult | null>(null);
  const [fetcher] = useState(() => createSearchFixtureFetcher());
  return (
    <StoryPage
      title={
        mode === "import"
          ? "Import climb picker"
          : mode === "merge"
            ? "Merge climb picker"
            : "Choose a climb"
      }
    >
      <ClimbPicker
        onCreateClimb={() =>
          setSelected({
            id: "draft",
            kind: "area",
            name: "New climb draft",
            detail: "Sample selection only",
            href: "",
          })
        }
        allowSentClimbs
        showFilters={mode !== "logging"}
        showAreaLookup={mode === "import"}
        excludedClimbId={mode === "merge" ? 101 : undefined}
        initialName={mode === "import" ? "Cedar Arete" : initialQuery}
        initialAreaName={mode === "import" ? "Cedar Grove" : undefined}
        fetcher={fetcher}
        areaFetcher={searchAreaFetcher}
        onPick={(climb) =>
          setSelected({
            id: `climb-${climb.id}`,
            kind: "climb",
            name: climb.name,
            detail: climb.areaName,
            discipline: climb.type,
            grade: climb.grade,
            href: "",
          })
        }
      />
      <Selection selected={selected} />
    </StoryPage>
  );
}
