"use client";

import { clsx } from "clsx";
import NextLink from "next/link";
import type { ComponentProps } from "react";

import { LinkPendingReporter } from "./navigation-progress";

type AppLinkProps = ComponentProps<typeof NextLink>;

/** Internal Next.js navigation with HeroUI Link styling.
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
export function AppLink({ className, prefetch = false, children, ...props }: AppLinkProps) {
  return (
    <NextLink
      {...props}
      className={clsx("link focus-visible:status-focused", className)}
      prefetch={prefetch}
    >
      {children}
      <LinkPendingReporter href={typeof props.href === "string" ? props.href : null} />
    </NextLink>
  );
}
