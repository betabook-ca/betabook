/** Records which overlay types (drawer, modal) were added to the page, in order.
 * Catches a dialog that mounts already open: it renders the mobile drawer first
 * and then switches to a modal, which checking only the final state would miss. */
export function watchOverlayKinds() {
  const seen: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        for (const element of [node, ...node.querySelectorAll("*")]) {
          const name = typeof element.className === "string" ? element.className : "";
          const kind = /\b(drawer|modal)(?=__|\b)/.exec(name)?.[1];
          if (kind && !seen.includes(kind)) seen.push(kind);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen, stop: () => observer.disconnect() };
}
