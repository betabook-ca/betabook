"use client";

import { clsx } from "clsx";
import { useId, useRef, useState, type RefObject } from "react";

import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

// Sub-pixel line heights make a paragraph that fits its clamp exactly report
// a hairline of overflow; without a tolerance those rows grow a "Show more"
// that expands to reveal nothing.
const OVERFLOW_TOLERANCE_PX = 1;

/** Whether `ref`'s element is taller than the height its clamp allows.
 *
 * A `line-clamp`ped element is a `-webkit-box` whose `clientHeight` is pinned
 * to the clamped line count while `scrollHeight` still reports the full text —
 * CSS exposes no other signal that it truncated anything, so this has to be
 * measured against real layout.
 *
 * Two things change the answer after the first measurement and neither is a
 * re-render: the element's width (the text rewraps into a different number of
 * lines) and the webfont swapping in under `display: swap` (the clamped height
 * is a multiple of the unchanged font-size, so the ResizeObserver never fires,
 * but the content height moves). Hence the observer *and* the fonts.ready
 * pass. */
function useIsOverflowing(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [overflowing, setOverflowing] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element == null || !enabled) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setOverflowing(element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE_PX);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Not awaited anywhere, so the flag is what keeps a late swap from
    // measuring an unmounted (or since-expanded) paragraph.
    void document.fonts?.ready.then(measure);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [ref, enabled]);

  return overflowing;
}

/** A send's comment, clamped to two lines, with a toggle that appears only
 * when the clamp is actually hiding something. Two rather than three: the
 * toggle costs the row a line of its own, so the collapsed comment gives one
 * back and a long-commented row stays the height it was before.
 *
 * Expansion is per-row local state — a list re-render (a "load more" page, a
 * post-mutation server refresh) is allowed to collapse it again; there's
 * nothing here worth persisting. */
export function ClampedComment({
  children,
  expandLabel = "Show more",
  collapseLabel = "Show less",
}: {
  children: string;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const commentRef = useRef<HTMLParagraphElement>(null);
  const commentId = useId();
  // Measuring while expanded would compare an unclamped element against
  // itself, report "fits", and drop the button the reader needs to collapse
  // it — so the last collapsed answer is the one that stands.
  const overflowing = useIsOverflowing(commentRef, !expanded);

  return (
    <>
      <p id={commentId} ref={commentRef} className={clsx(!expanded && "line-clamp-2")}>
        {children}
      </p>
      {(overflowing || expanded) && (
        // Deliberately not the project's usual ghost Button: a boxed control
        // sitting under a couple of lines of prose fights the row's guidebook
        // density and costs every long-commented row ~32px. This is AppLink's
        // styling recipe on a button — HeroUI's `.link` drives hover/press off
        // native pseudo-classes, which a <button> gets the same as an <a>.
        <button
          type="button"
          onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
          aria-expanded={expanded}
          aria-controls={commentId}
          className="link text-sm font-medium focus-visible:status-focused"
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </>
  );
}
