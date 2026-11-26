type BootstrapEnvelope = {
  route: string;
  path: string;
  query?: string;
  data: unknown;
};

const SCRIPT_ELEMENT_ID = "__BETABOOK_DATA__";
let activeEnvelope: BootstrapEnvelope | null = null;

/** Normalize form-query encoding and unrelated key order, retaining repeated
 * values in their original order (the first mode/name has meaning). */
function queryKey(raw: string): string {
  const params = new URLSearchParams(raw);
  params.sort();
  return params.toString();
}

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
        query: typeof parsed.query === "string" ? queryKey(parsed.query) : undefined,
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
 * path (and optional query string). Stays idempotent across React StrictMode
 * double-renders on initial load, and automatically clears on navigation. */
export function peekBootstrapData(
  route: string,
  currentPath: string,
  currentQuery?: string,
): unknown {
  readScriptFromDocument();
  if (!activeEnvelope) {
    return null;
  }
  if (activeEnvelope.route !== route || activeEnvelope.path !== currentPath) {
    return null;
  }
  if (currentQuery !== undefined && (activeEnvelope.query ?? "") !== queryKey(currentQuery)) {
    return null;
  }
  return activeEnvelope.data;
}

/** Clears cached cold-load bootstrap data when client-side navigation leaves
 * the bootstrapped path so returning later fetches fresh data from `/api`. */
export function syncBootstrapPath(currentPath: string, currentQuery?: string): void {
  readScriptFromDocument();
  if (
    activeEnvelope &&
    (activeEnvelope.path !== currentPath ||
      (activeEnvelope.route === "search" &&
        currentQuery !== undefined &&
        (activeEnvelope.query ?? "") !== queryKey(currentQuery)))
  ) {
    activeEnvelope = null;
  }
}

/** Clears cached cold-load bootstrap state explicitly (e.g. `router.refresh`). */
export function clearBootstrapData(): void {
  activeEnvelope = null;
}
