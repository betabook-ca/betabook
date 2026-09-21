"use client";

import { Disclosure } from "@heroui/react";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";

import { useIsAtLeast } from "@/hooks/use-breakpoint";

type Breakpoint = "md" | "lg";

// Tailwind only generates CSS for classes it finds as complete literal
// strings in source — building one via `${breakpoint}:hidden` wouldn't
// generate the override, so each full class name is spelled out here and
// looked up by `breakpoint` instead.
const DESKTOP_TITLE_CLASSNAME: Record<Breakpoint, string> = {
  md: "hidden md:block",
  lg: "hidden lg:block",
};
// `sr-only` doesn't set `display`, so `hidden` needs an explicit
// `block` override before the sr-only clipping applies at the breakpoint.
const DESKTOP_SR_TITLE_CLASSNAME: Record<Breakpoint, string> = {
  md: "hidden md:block md:sr-only",
  lg: "hidden lg:block lg:sr-only",
};
const TRIGGER_HEADING_CLASSNAME: Record<Breakpoint, string> = {
  md: "contents md:hidden",
  lg: "contents lg:hidden",
};
// From the breakpoint up the panel is permanently expanded, so the collapse
// animation's `overflow: clip` only costs (it clips focus outlines at the
// panel edges, which the un-wrapped desktop markup never did).
const CONTENT_CLASSNAME: Record<Breakpoint, string> = {
  md: "md:overflow-visible",
  lg: "lg:overflow-visible",
};
// First-paint fallback, applied only until `useIsAtLeast` resolves: the
// server renders the panel expanded (see below), and this class keeps it
// visually collapsed below the breakpoint until then. It can't linger
// longer, or it would override the user expanding the section on mobile.
const PREHYDRATION_CONTENT_CLASSNAME: Record<Breakpoint, string> = {
  md: "max-md:hidden",
  lg: "max-lg:hidden",
};

/** A section that's always open on desktop (from `breakpoint` up) and a
 * closed-by-default accordion below it, mounting `children` exactly once.
 *
 * One `Disclosure` holds the single copy of `children`; its `isExpanded` is
 * controlled — forced open from `breakpoint` up (where the trigger row is
 * CSS-hidden, so it can't be re-collapsed) and user-toggled below. Crossing
 * the breakpoint therefore only flips the expanded state; the children keep
 * their state instead of a second pristine copy becoming visible.
 *
 * SSR can't know the viewport, so the server renders the panel *expanded* —
 * the one render that works on desktop without JS, and the only one that
 * avoids fighting the `hidden` attribute a collapsed panel carries (the
 * preflight `[hidden]` rule is `!important` in an early cascade layer, which
 * beats `!` utilities). Below the breakpoint a pre-hydration-only CSS class
 * keeps the panel visually collapsed until `useIsAtLeast` resolves, in the
 * same pre-paint commit that hands control to `isExpanded`. Tradeoff: below
 * the breakpoint without JS the panel can't be expanded, and until hydration
 * the trigger's indicator/aria-expanded read as expanded while the panel is
 * CSS-hidden. */
export function CollapsibleSection({
  title,
  breakpoint = "md",
  showTitleOnDesktop = true,
  children,
}: {
  title: string;
  breakpoint?: Breakpoint;
  /** The mobile trigger always shows `title` — this only controls whether
   * the desktop heading is visible or sr-only (it always exists, so the
   * heading outline is stable on both sides of the breakpoint). */
  showTitleOnDesktop?: boolean;
  children: ReactNode;
}) {
  const isDesktop = useIsAtLeast(breakpoint);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const isExpanded = isDesktop === undefined ? true : isDesktop || mobileExpanded;

  return (
    <Disclosure
      className="flex flex-col gap-2"
      isExpanded={isExpanded}
      // Only reachable below the breakpoint — the trigger is display:none
      // from it up — so this only ever records the user's mobile choice,
      // which survives round trips across the breakpoint.
      onExpandedChange={setMobileExpanded}
    >
      <h2
        className={clsx(
          "text-lg font-semibold",
          showTitleOnDesktop
            ? DESKTOP_TITLE_CLASSNAME[breakpoint]
            : DESKTOP_SR_TITLE_CLASSNAME[breakpoint],
        )}
      >
        {title}
      </h2>
      <Disclosure.Heading level={2} className={TRIGGER_HEADING_CLASSNAME[breakpoint]}>
        <Disclosure.Trigger className="flex min-h-11 w-full items-center gap-1 text-lg font-semibold">
          {title}
          {/* The indicator's own styles put it at the row's far edge
           * (ms-auto), which the full-width trigger now gives room for. */}
          <Disclosure.Indicator className="size-4" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content
        className={clsx(
          CONTENT_CLASSNAME[breakpoint],
          isDesktop === undefined && PREHYDRATION_CONTENT_CLASSNAME[breakpoint],
        )}
      >
        <Disclosure.Body style={{ padding: 0 }}>{children}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
