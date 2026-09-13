"use client";

import { useState } from "react";

import { FriendshipActionButton } from "@/components/friendship-action-button";
import { SearchController } from "@/components/search/search-controller";
import { AppLink } from "@/components/ui/app-link";
import { TOUR_DEMO_SEARCH_RESULTS } from "@/lib/product-tour-demo";
import {
  EMPTY_SEARCH,
  type SearchFetcher,
  type SearchState,
  type SearchPage,
  type SearchSnapshot,
} from "@/lib/search";

const demoPage = (
  state: SearchState,
  kind: SearchState["category"] & ("climb" | "area" | "climber"),
): SearchPage => {
  const result = TOUR_DEMO_SEARCH_RESULTS[kind];
  const matches =
    !!state.query.trim() && result.name.toLowerCase().startsWith(state.query.trim().toLowerCase());
  return {
    items: matches
      ? [
          {
            id: `demo-${kind}`,
            kind,
            name: result.name,
            detail: kind === "climber" ? "Climber" : result.detail,
            ...(kind === "climb" ? { discipline: "boulder" as const, grade: 5 } : {}),
            href: "",
          } as import("@/lib/search").AppSearchResult,
        ]
      : [],
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
      <h1 className="sr-only">Search</h1>
      <SearchController
        initial={initial}
        state={state}
        onChange={setState}
        fetcher={fetchDemo}
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
