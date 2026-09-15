"use client";

import { useCallback } from "react";

/** Keep the active input inside an overlay's scroll area as the keyboard resizes it. */
export function useFocusedFieldScroll() {
  return useCallback((body: HTMLDivElement | null) => {
    if (!body) return;
    const scrollBody = body;
    const viewport = window.visualViewport;
    let frame = 0;
    let observedPreview: Element | null = null;
    const resize = new ResizeObserver(schedule);
    function reveal() {
      const input = document.activeElement;
      if (
        !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) ||
        !scrollBody.contains(input) ||
        (viewport && viewport.scale !== 1)
      )
        return;

      const preview = input.closest("[data-focus-scroll-preview]");
      if (preview !== observedPreview) {
        if (observedPreview) resize.unobserve(observedPreview);
        observedPreview = preview;
        if (preview) resize.observe(preview);
      }
      const bounds = scrollBody.getBoundingClientRect();
      const field = input.getBoundingClientRect();
      const top = Math.max(bounds.top, viewport?.offsetTop ?? 0) + 8;
      const bottom =
        Math.min(
          bounds.bottom,
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
        ) - 8;
      // Leave room for the filters and the start of a result below mobile search.
      // Observe the picker too: results can arrive after the keyboard has settled.
      const previewSpace =
        preview && input.value.trim() && window.innerWidth < 640
          ? Math.min(160, Math.max(0, bottom - top - field.height))
          : 0;
      if (field.bottom + previewSpace > bottom)
        scrollBody.scrollTop += field.bottom + previewSpace - bottom;
      else if (field.top < top) scrollBody.scrollTop -= top - field.top;
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
    }
    resize.observe(body);
    body.addEventListener("focusin", schedule);
    body.addEventListener("input", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      body.removeEventListener("focusin", schedule);
      body.removeEventListener("input", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, []);
}
