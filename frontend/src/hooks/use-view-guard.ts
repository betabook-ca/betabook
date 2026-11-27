import { useRef, type RefObject } from "react";

import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

// A Back/Forward round trip can restore the exact starting URL and entry before
// a suspended navigation commits. One document listener also observes that case.
let historyTraversals = 0;
function recordTraversal() {
  historyTraversals += 1;
}

function historyKey(): unknown {
  const state: unknown = window.history.state;
  return state && typeof state === "object" && "key" in state ? state.key : null;
}

function captureView(revision: RefObject<number>) {
  window.addEventListener("popstate", recordTraversal);
  const traversals = historyTraversals;
  const entry = historyKey();
  const started = revision.current;
  const { pathname, search } = window.location;
  return () =>
    started === revision.current &&
    traversals === historyTraversals &&
    entry === historyKey() &&
    window.location.pathname === pathname &&
    window.location.search === search;
}

/** Capture the active view before awaiting a write. Browser navigation can
 * change the address before React commits the new route and unmounts this one. */
export function useViewGuard(owner: string, record?: number) {
  const revision = useRef(0);
  useIsomorphicLayoutEffect(
    () => () => {
      revision.current += 1;
    },
    [owner, record],
  );
  return () => captureView(revision);
}
