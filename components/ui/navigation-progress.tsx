"use client";

import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/** The one link navigation in flight. The router hands pending status to
 * the newest click, so there is never more than one. */
type InFlight = {
  token: object;
  from: string;
  target: string | null;
  /** Set once the clicked link unmounted; see orphan(). */
  orphanTimer: ReturnType<typeof setTimeout> | null;
};

/** How long an orphaned navigation may keep the bar up without the URL
 * changing: past this it was redirected back here or failed. */
const ORPHAN_TIMEOUT_MS = 10_000;

let inFlight: InFlight | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentUrl() {
  return urlKey(window.location.pathname, new URLSearchParams(window.location.search));
}

function urlKey(pathname: string, search: URLSearchParams | null) {
  const query = search?.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function resolveTarget(href: string) {
  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin ? urlKey(url.pathname, url.searchParams) : null;
}

function begin(token: object, href: string | null) {
  const target = href === null ? null : resolveTarget(href);
  clearOrphanTimer();
  inFlight = { token, from: currentUrl(), target, orphanTimer: null };
  emit();
}

function clearOrphanTimer() {
  if (inFlight?.orphanTimer) clearTimeout(inFlight.orphanTimer);
}

function end(token: object) {
  if (inFlight?.token !== token) return;
  clearOrphanTimer();
  inFlight = null;
  emit();
}

/** A link inside a menu or dialog that closes on click unmounts before its
 * navigation settles, taking its pending status with it. Keep the bar until
 * the page's URL changes — unless the link pointed at the current URL, which
 * never will, or the URL still hasn't moved after ORPHAN_TIMEOUT_MS. */
function orphan(token: object) {
  if (inFlight?.token !== token) return;
  const url = currentUrl();
  if (url !== inFlight.from || inFlight.target === url) end(token);
  else inFlight.orphanTimer = setTimeout(() => end(token), ORPHAN_TIMEOUT_MS);
}

function settleOrphan(url: string) {
  if (inFlight?.orphanTimer && url !== inFlight.from) end(inFlight.token);
}

/** Tracks one AppLink's navigations. `start` goes in Link's onNavigate,
 * which runs in the click itself: a menu that closes in that same click can
 * unmount the link before its pending status ever renders, so waiting for
 * useLinkStatus to begin would miss it. The link's LinkPendingReporter calls
 * `settle` once the router is done, or `release` if the link unmounts
 * first, which hands the navigation to the bar. */
export function useLinkNavigation(href: string | null) {
  const token = useRef<object | null>(null);
  const start = useCallback(() => {
    token.current = {};
    begin(token.current, href);
  }, [href]);
  const settle = useCallback(() => {
    if (token.current) end(token.current);
    token.current = null;
  }, []);
  const release = useCallback(() => {
    if (token.current) orphan(token.current);
  }, []);
  return { start, settle, release };
}

/** Rendered inside every AppLink, where useLinkStatus can see the link's
 * pending status. */
export function LinkPendingReporter({
  settle,
  release,
}: {
  settle: () => void;
  release: () => void;
}) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) settle();
  }, [pending, settle]);
  useEffect(() => release, [release]);
  return null;
}

/** A thin bar across the top of the viewport while a link navigation is in
 * flight, so a click shows at once that it was taken — before the server has
 * answered with the next page or its loading state. */
export function NavigationProgress() {
  const pending = useSyncExternalStore(
    subscribe,
    () => inFlight !== null,
    () => false,
  );
  const url = urlKey(usePathname(), useSearchParams());
  useEffect(() => settleOrphan(url), [url]);
  return pending ? <NavigationProgressBar /> : null;
}

/** The bar itself: an indeterminate sweep, or a still bar with reduced
 * motion. */
export function NavigationProgressBar() {
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 animate-navigation-progress-in overflow-hidden"
    >
      <div className="h-full w-full bg-accent opacity-60 motion-safe:w-2/5 motion-safe:animate-navigation-progress motion-safe:opacity-100" />
    </div>
  );
}
