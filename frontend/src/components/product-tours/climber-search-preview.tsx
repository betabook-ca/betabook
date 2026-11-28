"use client";

import { useState } from "react";

import { FriendshipActionButton } from "@/components/friends/friendship-action-button";
import { demoAreaFetcher } from "@/components/product-tours/climb-search-preview";
import { SearchController } from "@/components/search/search-controller";
import { AppLink } from "@/components/ui/app-link";
import { TOUR_DEMO_SEARCH_RESULTS } from "@/lib/product-tour-demo";
import {
  EMPTY_SEARCH,
  type AppSearchResult,
  type SearchFetcher,
  type SearchKind,
  type SearchState,
  type SearchPage,
  type SearchSnapshot,
} from "@/lib/search";

const demoItem = (kind: SearchKind): AppSearchResult => {
  const result = TOUR_DEMO_SEARCH_RESULTS[kind];
  const base = { id: `demo-${kind}`, name: result.name, href: "" };
  return kind === "climb"
    ? { ...base, kind, detail: result.detail, discipline: "boulder", grade: 5 }
    : { ...base, kind, detail: kind === "climber" ? "Climber" : result.detail };
};

const demoPage = (state: SearchState, kind: SearchKind): SearchPage => {
  const result = TOUR_DEMO_SEARCH_RESULTS[kind];
  const matches =
    !!state.query.trim() && result.name.toLowerCase().startsWith(state.query.trim().toLowerCase());
  return {
    items: matches ? [demoItem(kind)] : [],
    hasMore: false,
    nextPage: 2,
  };
};

const fetchDemo: SearchFetcher = async (state, kind) => demoPage(state, kind);
const initialState: SearchState = { ...EMPTY_SEARCH, category: "climber", query: "Riley" };
const initial: SearchSnapshot = [
  { kind: "climber", status: "ready", page: demoPage(initialState, "climber") },
];

/** Uses the live search controller with fictional transport and local actions. */
export function DemoClimberSearch({ feedHref }: { feedHref: string }) {
  const [state, setState] = useState(initialState);
  const [requested, setRequested] = useState(false);
  const [selected, setSelected] = useState("");
  return (
    <section
      aria-label="Search"
      data-tour-target="friend-search"
      className="flex max-w-2xl flex-col gap-6"
    >
      <h1 className="sr-only">Find climbs</h1>
      <SearchController
        initial={initial}
        state={state}
        onChange={setState}
        fetcher={fetchDemo}
        areaFetcher={demoAreaFetcher}
        onNavigate={(item) => setSelected(item.name)}
        onExpand={() => {}}
        renderAction={(item) =>
          item.kind === "climber" ? (
            <div>
              {requested && (
                <p role="status" className="text-xs text-muted">
                  Waiting for a reply
                </p>
              )}
              <FriendshipActionButton
                action={requested ? "cancel" : "add"}
                name={item.name}
                onPress={(complete) => {
                  setRequested(!requested);
                  complete();
                }}
              />
            </div>
          ) : null
        }
      />
      {selected && <p role="status">Selected {selected}</p>}
      <AppLink href={feedHref}>View your feed</AppLink>
    </section>
  );
}
