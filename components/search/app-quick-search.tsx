"use client";
import { useEffect, useState } from "react";

import { useMounted } from "@/hooks/use-mounted";
import { AUTH_REQUIRED_EVENT } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { EMPTY_SEARCH, searchHref } from "@/lib/search";

import { SearchController } from "./search-controller";

export function AppQuickSearch({
  isOpen,
  onOpenChange,
  scopeAreaId,
  scopeAreaName,
  onNavigate,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  scopeAreaId?: number;
  scopeAreaName?: string;
  onNavigate: (href: string) => void;
}) {
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const sessionId = session?.session.id;
  const [rejectedSessionId, setRejectedSessionId] = useState<string>();
  // The palette lives outside page templates and must also discard cached results
  // when another component discovers that this session is no longer valid.
  useEffect(() => {
    const expired = () => setRejectedSessionId(sessionId);
    window.addEventListener(AUTH_REQUIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, expired);
  }, [sessionId]);
  const viewerId =
    mounted && !isPending && sessionId !== rejectedSessionId ? (session?.user.id ?? null) : null;
  const [state, setState] = useState(EMPTY_SEARCH);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // The provider lives across routes; each new dialog session starts globally.
  // Reset on opening so the previous content can finish its closing animation.
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setState(EMPTY_SEARCH);
  }
  return (
    <SearchController
      key={viewerId ?? "anonymous"}
      publicOnly={viewerId === null}
      quick
      state={state}
      onChange={setState}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      suggestedArea={
        scopeAreaId !== undefined && scopeAreaName
          ? { id: String(scopeAreaId), name: scopeAreaName, path: "" }
          : undefined
      }
      onNavigate={(item) => onNavigate(item.href)}
      onExpand={() => onNavigate(searchHref(state))}
    />
  );
}
