"use client";

import { useCallback } from "react";

/** Keep the active input inside an overlay's scroll area as the keyboard resizes it. */
export function useFocusedFieldScroll() {
  return useCallback((body: HTMLDivElement | null) => {
    if (!body) return;
    const scrollBody = body;
    const viewport = window.visualViewport;
    let frame = 0;
    function reveal() {
      const input = document.activeElement;
      if (
        !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) ||
        !scrollBody.contains(input) ||
        (viewport && viewport.scale !== 1)
      )
        return;

      const bounds = scrollBody.getBoundingClientRect();
      const field = input.getBoundingClientRect();
      const top = Math.max(bounds.top, viewport?.offsetTop ?? 0) + 8;
      const bottom =
        Math.min(
          bounds.bottom,
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
        ) - 8;
      if (field.bottom > bottom) scrollBody.scrollTop += field.bottom - bottom;
      else if (field.top < top) scrollBody.scrollTop -= top - field.top;
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(body);
    body.addEventListener("focusin", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      body.removeEventListener("focusin", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, []);
}
