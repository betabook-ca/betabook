type BootstrapEnvelope = {
  route: string;
  path: string;
  data: unknown;
};

const SCRIPT_ELEMENT_ID = "__BETABOOK_DATA__";
let activeEnvelope: BootstrapEnvelope | null = null;

function readScriptFromDocument(): void {
  if (typeof document === "undefined") {
    return;
  }
  const el = document.getElementById(SCRIPT_ELEMENT_ID);
  if (!el) {
    return;
  }
  const raw = el.textContent;
  el.remove();
  if (!raw) {
    activeEnvelope = null;
    return;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BootstrapEnvelope>;
    if (typeof parsed.route === "string" && typeof parsed.path === "string") {
      activeEnvelope = {
        route: parsed.route,
        path: parsed.path,
        data: parsed.data,
      };
    } else {
      activeEnvelope = null;
    }
  } catch {
    activeEnvelope = null;
  }
}

/** Reads inline Worker-injected `__BETABOOK_DATA__` for the matching route and
 * path. Stays idempotent across React StrictMode double-renders on initial
 * load, and automatically clears when client navigation leaves that path. */
export function peekBootstrapData(route: string, currentPath: string): unknown {
  readScriptFromDocument();
  if (!activeEnvelope) {
    return null;
  }
  if (activeEnvelope.route !== route || activeEnvelope.path !== currentPath) {
    return null;
  }
  return activeEnvelope.data;
}

/** Clears cached cold-load bootstrap data when client-side navigation leaves
 * the bootstrapped path so returning later fetches fresh data from `/api`. */
export function syncBootstrapPath(currentPath: string): void {
  readScriptFromDocument();
  if (activeEnvelope && activeEnvelope.path !== currentPath) {
    activeEnvelope = null;
  }
}

/** Clears cached cold-load bootstrap state explicitly (e.g. `router.refresh`). */
export function clearBootstrapData(): void {
  activeEnvelope = null;
}
