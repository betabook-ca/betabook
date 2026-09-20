/** The mobile keyboard shrinks the *visual* viewport, not the layout one.
 * `interactiveWidget: "resizes-content"` (app/layout.tsx) makes Chrome resize
 * the layout viewport too, but Safari ignores it — so on iOS `innerHeight`
 * still reports the full screen with the keyboard up, and `visualViewport` is
 * the only reading that shrinks. Everything that has to fit above the
 * keyboard measures through here.
 */

/** Height actually visible to the viewer, keyboard excluded where the
 * browser reports it. Falls back to the layout viewport, then to 0 on the
 * server, so callers can treat it as "roomy until proven otherwise". */
export function visualViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Subscribes to every event that can change {@link visualViewportHeight}.
 * `scroll` matters as well as `resize`: iOS pans the visual viewport rather
 * than resizing it when a focused field would sit under the keyboard.
 * Returns its own cleanup. */
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
