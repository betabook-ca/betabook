"use client";

import { useEffect, useState } from "react";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { FriendshipButton } from "@/components/friendship-button";
import type { SuggestedClimberRow } from "@/db/queries";
import { useClimberSuggestions } from "@/hooks/use-climber-suggestions";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";
import {
  climberSuggestionItems,
  searchHref,
  showsClimberSuggestions,
  type SearchSnapshot,
  type SearchState,
} from "@/lib/search";
import { useRouter } from "@/spa/lib/navigation";

import { SearchController } from "./search-controller";

export function AppSearch({
  initialState,
  initial,
  suggestions,
  viewerId,
  onAreaSelected,
  showMemberNotice = true,
  memberNoticePlacement,
}: {
  initialState: SearchState;
  initial?: SearchSnapshot;
  suggestions: SuggestedClimberRow[] | null;
  viewerId: string | null;
  defaultCategory?: SearchState["category"];
  onAreaSelected?: (area: NonNullable<SearchState["area"]>) => void;
  showMemberNotice?: boolean;
  memberNoticePlacement?: "results" | "top";
}) {
  const router = useRouter();
  // Controlled keystrokes need synchronous feedback while the router commits
  // the URL. Category, scope and other filters always follow the location.
  const sourceHref = searchHref(initialState);
  const [typing, setTyping] = useState<{ sourceHref: string; query: string } | null>(null);
  const pendingQuery = typing?.sourceHref === sourceHref ? typing.query : undefined;
  const state =
    pendingQuery === undefined ? initialState : { ...initialState, query: pendingQuery };
  useEffect(() => {
    const restore = () => setTyping(null);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const suggested = useClimberSuggestions(showsClimberSuggestions(state, viewerId), suggestions);
  function change(next: SearchState) {
    setTyping(next.query !== state.query ? { sourceHref, query: next.query } : null);
    if (next.area) onAreaSelected?.(next.area);
    const href = searchHref(next);
    if (next.category !== state.category || next.area?.id !== state.area?.id)
      router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }
  if (mounted && !isPending && (session?.user.id ?? null) !== viewerId)
    return <CurrentPageAuthCallout />;
  return (
    <SearchController
      key={viewerId ?? "anonymous"}
      publicOnly={viewerId === null}
      showMemberNotice={viewerId === null && showMemberNotice}
      memberNoticePlacement={memberNoticePlacement}
      state={state}
      onChange={change}
      initial={pendingQuery === undefined ? initial : undefined}
      onNavigate={(item) => router.push(item.href)}
      resultHref={(item) => item.href}
      suggestions={climberSuggestionItems(suggested)}
      onExpand={() => change(state)}
      renderAction={(item) =>
        item.climber ? (
          <FriendshipButton
            userId={item.climber.id}
            name={item.name}
            initialStatus={item.climber.friendshipStatus}
          />
        ) : null
      }
    />
  );
}
