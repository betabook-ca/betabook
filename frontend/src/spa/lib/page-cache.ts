/** The last result of recently visited pages, so switching back to a tab
 * shows what it showed before instead of a skeleton. Entries are keyed by the
 * loader's scope, which carries the viewer and any share credential, so one
 * viewer's result is never shown to another. */

/** Every successful mutation and explicit refresh revalidates page loaders.
 * Counted here, not per component, so a page left and revisited can tell
 * whether its last result predates a change. */
let generation = 0;
if (typeof window !== "undefined") {
  window.addEventListener("betabook:router-refresh", () => {
    generation += 1;
  });
}

const CACHE_LIMIT = 24;
const cache = new Map<string, { data: unknown; generation: number }>();

function cacheKey(resource: string, scope: string, query: string) {
  return JSON.stringify([resource, scope, query]);
}

export function pageGeneration() {
  return generation;
}

/** `fresh` when nothing has changed since the result loaded; `stale` when a
 * mutation or explicit refresh has happened since. */
export function readPageCache(resource: string, scope: string, query: string) {
  const entry = cache.get(cacheKey(resource, scope, query));
  if (!entry) return null;
  return {
    data: entry.data,
    freshness: entry.generation === generation ? ("fresh" as const) : ("stale" as const),
  };
}

export function writePageCache(
  resource: string,
  scope: string,
  query: string,
  data: unknown,
  loadedAt: number,
) {
  const key = cacheKey(resource, scope, query);
  cache.delete(key);
  cache.set(key, { data, generation: loadedAt });
  if (cache.size <= CACHE_LIMIT) return;
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

/** Drops every result of one loader and scope, once access to it has gone. */
export function forgetPageScope(resource: string, scope: string) {
  for (const key of cache.keys()) {
    const [entryResource, entryScope] = JSON.parse(key) as [string, string];
    if (entryResource === resource && entryScope === scope) cache.delete(key);
  }
}

/** Tests start from an empty cache. */
export function clearPageCache() {
  cache.clear();
}
