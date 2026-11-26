"use client";

import { useState } from "react";

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
  initial: SearchSnapshot;
  suggestions: SuggestedClimberRow[] | null;
  viewerId: string | null;
  defaultCategory?: SearchState["category"];
  onAreaSelected?: (area: NonNullable<SearchState["area"]>) => void;
  showMemberNotice?: boolean;
  memberNoticePlacement?: "results" | "top";
}) {
  const router = useRouter();
  // Keep the field synchronous while React Router commits the query string.
  // A new URL (including Back/Forward) immediately takes over from this draft.
  const [draft, setDraft] = useState<{ source: SearchState; value: SearchState } | null>(null);
  const state = draft?.source === initialState ? draft.value : initialState;
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const suggested = useClimberSuggestions(showsClimberSuggestions(state, viewerId), suggestions);
  function change(next: SearchState) {
    setDraft({ source: initialState, value: next });
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
      initial={initial}
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
