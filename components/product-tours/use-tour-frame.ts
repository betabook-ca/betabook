"use client";

import { useEffect, useState, type RefObject } from "react";

import { onVisualViewportChange } from "@/lib/visual-viewport";

/** Fit the demo and guide below the app header, including a resized mobile keyboard viewport. */
export function useTourFrame(frame: RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    function measure() {
      if (!frame.current) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      setHeight(Math.max(200, bottom - frame.current.getBoundingClientRect().top - 16));
    }
    const resize = new ResizeObserver(measure);
    if (frame.current) resize.observe(frame.current);
    const unsubscribe = onVisualViewportChange(measure);
    measure();
    return () => {
      resize.disconnect();
      unsubscribe();
    };
  }, [frame]);
  return height;
}
