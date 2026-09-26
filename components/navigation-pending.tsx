"use client";

import { clsx } from "clsx";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type NavigationPending = {
  isPending: boolean;
  setPending: (pending: boolean) => void;
};

const NavigationPendingContext = createContext<NavigationPending | null>(null);

/** Bridges "a filter/search navigation is in flight" from a filter panel
 * (the client island whose transition owns the pending state — see
 * useDebouncedReplace) to the server-rendered results that navigation is
 * about to replace. The two are siblings in the page tree, so the page
 * wraps both in this provider; the panel reports through
 * useReportNavigationPending (called inside useFilterFormNavigation) and
 * <NavigationPendingRegion> dims and marks the results while the round trip
 * is in flight. */
export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const [isPending, setPending] = useState(false);
  const value = useMemo(() => ({ isPending, setPending }), [isPending]);
  return (
    <NavigationPendingContext.Provider value={value}>{children}</NavigationPendingContext.Provider>
  );
}

/** Reports the caller's pending state into the surrounding provider — a
 * no-op when there isn't one (not every embedding of a filter form has a
 * results region to dim). */
export function useReportNavigationPending(isPending: boolean): void {
  const setPending = useContext(NavigationPendingContext)?.setPending;
  useEffect(() => {
    if (!setPending) return;
    setPending(isPending);
    return () => setPending(false);
  }, [isPending, setPending]);
}

/** Wraps a results list: dimmed, marked busy and announced while a
 * filter/search navigation reported into the surrounding provider is in
 * flight. */
export function NavigationPendingRegion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const isPending = useContext(NavigationPendingContext)?.isPending ?? false;
  return (
    <div
      aria-busy={isPending}
      className={clsx("transition-opacity", isPending && "opacity-60", className)}
    >
      {/* aria-busy alone is silent in screen readers. */}
      <p role="status" className="sr-only">
        {isPending ? "Updating results…" : ""}
      </p>
      {children}
    </div>
  );
}
