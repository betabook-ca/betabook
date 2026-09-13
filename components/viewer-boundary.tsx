"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { useMounted } from "@/hooks/use-mounted";
import { AUTH_REQUIRED_EVENT } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

/** Discard displayed data when accounts change and refresh current permissions
 * when returning to a profile or Friends list. No promise of live revocation. */
export function ViewerBoundary({
  viewerId,
  children,
}: {
  viewerId: string | null;
  children: ReactNode;
}) {
  const [authRequired, setAuthRequired] = useState(false);
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  const [lastViewerId, setLastViewerId] = useState<string | null>();
  const currentViewerId = isPending ? lastViewerId : (session?.user.id ?? null);
  if (!isPending && currentViewerId !== lastViewerId) setLastViewerId(currentViewerId);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const lastRefreshAt = useRef(-Infinity);
  useEffect(() => {
    const refresh = () => {
      // Browsers can emit both events for a single tab return. Also avoid
      // starting a second route refresh while the first one is in flight.
      if (document.visibilityState !== "visible" || refreshing) return;
      const now = Date.now();
      if (now - lastRefreshAt.current < 1_000) return;
      lastRefreshAt.current = now;
      startRefresh(() => router.refresh());
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, refreshing, startRefresh]);
  const changed = mounted && currentViewerId !== undefined && currentViewerId !== viewerId;
  useEffect(() => {
    const expired = () => {
      setAuthRequired(true);
      router.refresh();
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, expired);
  }, [router]);
  useEffect(() => {
    if (changed) router.refresh();
  }, [changed, router]);
  if (changed || authRequired) return <CurrentPageAuthCallout />;
  // The server can observe an account switch before useSession finishes.
  // Never carry a previous viewer's drafts or loaded pages into that tree.
  return <Fragment key={viewerId}>{children}</Fragment>;
}
