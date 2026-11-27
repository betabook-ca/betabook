import { useEffectEvent, useLayoutEffect } from "react";

/** The public document remains usable until its route has committed real
 * content. Leave a native link/form alone while a pointer click is in flight. */
export function usePublicEntryReady(ready: boolean, adopt?: () => void) {
  const beforeRemoval = useEffectEvent(() => adopt?.());
  useLayoutEffect(() => {
    const entry = document.getElementById("public-entry");
    if (!ready || !entry) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish() {
      if (!entry?.isConnected) return;
      const active = document.activeElement;
      const focusedHref =
        active instanceof HTMLAnchorElement && entry.contains(active) ? active.href : null;
      // Make the destination focusable before moving a live input into it.
      entry.dataset.handoff = "";
      beforeRemoval();
      entry.remove();
      if (focusedHref) {
        const links = document.querySelectorAll<HTMLAnchorElement>("#root a[href]");
        Array.from(links)
          .find((link) => link.href === focusedHref && link.getClientRects().length > 0)
          ?.focus({ preventScroll: true });
      }
    }
    function afterClick() {
      timer = setTimeout(finish, 0);
    }
    if (!entry.matches(":active")) {
      finish();
      return;
    }
    document.addEventListener("pointerup", afterClick, true);
    document.addEventListener("pointercancel", afterClick, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerup", afterClick, true);
      document.removeEventListener("pointercancel", afterClick, true);
    };
  }, [ready]);
}
