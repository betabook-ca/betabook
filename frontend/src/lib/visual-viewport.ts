// The mobile keyboard shrinks the visual viewport, not the layout one.
// `interactiveWidget: "resizes-content"` in app/layout.tsx makes Chrome
// shrink both, but Safari ignores it, so on iOS `innerHeight` still reports
// the full screen with a keyboard up. Anything that has to fit above the
// keyboard needs to measure here instead.

/** Visible height, minus the keyboard where the browser reports it. Falls
 * back to the layout viewport, and to 0 on the server. */
export function visualViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Subscribes to everything that can change {@link visualViewportHeight} and
 * returns a cleanup. `scroll` matters as well as `resize` — iOS pans the
 * visual viewport instead of resizing it when a focused field would end up
 * under the keyboard. */
export function onVisualViewportChange(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  window.visualViewport?.addEventListener("resize", listener);
  window.visualViewport?.addEventListener("scroll", listener);
  return () => {
    window.removeEventListener("resize", listener);
    window.visualViewport?.removeEventListener("resize", listener);
    window.visualViewport?.removeEventListener("scroll", listener);
  };
}
