"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { FriendshipButton } from "@/components/friendship-button";
import type { SuggestedClimberRow } from "@/db/queries";
import { useClimberSuggestions } from "@/hooks/use-climber-suggestions";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";
import {
  climberSuggestionItems,
  parseSearchState,
  searchHref,
  showsClimberSuggestions,
  type SearchSnapshot,
  type SearchState,
} from "@/lib/search";
import { searchParamsToRecord } from "@/lib/url-params";

import { SearchController } from "./search-controller";

export function AppSearch({
  initialState,
  initial,
  suggestions,
  viewerId,
}: {
  initialState: SearchState;
  initial: SearchSnapshot;
  suggestions: SuggestedClimberRow[] | null;
  viewerId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState(initialState);
  const [source, setSource] = useState(initialState);
  const lastWritten = useRef(params.toString());
  const areas = useRef(
    new Map(initialState.area ? [[initialState.area.id, initialState.area]] : []),
  );
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const suggested = useClimberSuggestions(showsClimberSuggestions(state, viewerId), suggestions);
  if (source !== initialState) {
    setSource(initialState);
    setState(initialState);
  }
  // History updates do not remount the field. Back/forward adopts the complete URL state.
  useEffect(() => {
    if (params.toString() === lastWritten.current) return;
    const parsed = parseSearchState(searchParamsToRecord(new URLSearchParams(params.toString())));
    const id = parsed.filter.areaId;
    parsed.area =
      id === undefined
        ? null
        : (areas.current.get(String(id)) ??
          (initialState.area?.id === String(id) ? initialState.area : null) ?? {
            id: String(id),
            name: "Selected area",
            path: "",
          });
    lastWritten.current = params.toString();
    setState(parsed);
  }, [params, initialState.area]);
  function change(next: SearchState) {
    setState(next);
    if (next.area) areas.current.set(next.area.id, next.area);
    const href = searchHref(next);
    lastWritten.current = href.slice(2);
    // Query edits replace a history entry; deliberate category/scope changes add one.
    if (next.category !== state.category || next.area?.id !== state.area?.id)
      window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }
  if (mounted && !isPending && (session?.user.id ?? null) !== viewerId)
    return <CurrentPageAuthCallout />;
  return (
    <SearchController
      key={viewerId ?? "anonymous"}
      publicOnly={viewerId === null}
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
