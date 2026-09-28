"use client";

import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

/** The one link navigation in flight. The router hands pending status to
 * the newest click, so there is never more than one. */
type InFlight = { token: object; from: string; target: string | null; orphaned: boolean };

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
  inFlight = { token, from: currentUrl(), target, orphaned: false };
  emit();
}

function end(token: object) {
  if (inFlight?.token !== token) return;
  inFlight = null;
  emit();
}

/** A link inside a menu or dialog that closes on click unmounts before its
 * navigation settles, taking its pending status with it. Keep the bar until
 * the page's URL changes — unless the link pointed at the current URL, which
 * never will. */
function orphan(token: object) {
  if (inFlight?.token !== token) return;
  const url = currentUrl();
  if (url !== inFlight.from || inFlight.target === url) end(token);
  else inFlight.orphaned = true;
}

function settleOrphan(url: string) {
  if (inFlight?.orphaned && url !== inFlight.from) end(inFlight.token);
}

/** Rendered inside every AppLink: reports its navigation from the click
 * until the router settles it. */
export function LinkPendingReporter({ href }: { href: string | null }) {
  const { pending } = useLinkStatus();
  const token = useRef<object | null>(null);
  useEffect(() => {
    if (pending) {
      token.current = {};
      begin(token.current, href);
    } else if (token.current) {
      end(token.current);
      token.current = null;
    }
  }, [pending, href]);
  useEffect(
    () => () => {
      if (token.current) orphan(token.current);
    },
    [],
  );
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
