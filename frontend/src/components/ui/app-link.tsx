"use client";

import { clsx } from "clsx";
import type { ComponentProps } from "react";

import RouterLink from "@/spa/lib/router-link";

import { LinkPendingReporter, useLinkNavigation } from "./navigation-progress";

type AppLinkProps = ComponentProps<typeof RouterLink>;

/** Internal application navigation with HeroUI Link styling.
 *
 * Styling: HeroUI's `.link` class styles hover/press via native
 * pseudo-classes, so a plain anchor gets those for free; only the
 * focus-visible ring comes exclusively from react-aria's data attributes,
 * so it's re-added here (same `status-focused` utility the CSS applies).
 *
 * Prefetching is opt-in to conserve Worker requests. Viewport visibility,
 * hover, focus, and touch (including the start of a swipe) must not fetch
 * routes the user may never open. Navigation still uses the client router.
 *
 * Every navigation it starts shows in the app's NavigationProgress bar. */
export function AppLink({
  className,
  prefetch = false,
  children,
  onNavigate,
  ...props
}: AppLinkProps) {
  const navigation = useLinkNavigation(typeof props.href === "string" ? props.href : null);
  return (
    <RouterLink
      {...props}
      className={clsx("link focus-visible:status-focused", className)}
      prefetch={prefetch}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (!cancelled) navigation.start();
      }}
    >
      {children}
      <LinkPendingReporter settle={navigation.settle} release={navigation.release} />
    </RouterLink>
  );
}
