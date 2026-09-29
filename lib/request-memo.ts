import { cacheForRequest } from "vinext/cache";

type MemoKey = string | number | boolean | null | undefined;
type Loader<Args extends MemoKey[], Result> = (...args: Args) => Promise<Result>;

// One table per request. Outside a request scope cacheForRequest hands back
// a fresh table on every call, so a memoized loader simply runs (tests, cron).
const tables = cacheForRequest(() => new WeakMap<object, Map<string, Promise<unknown>>>());

/** Shares one read between every caller in a request. React's `cache()`
 * covers only the page tree: under vinext, generateMetadata and route
 * handlers run outside the render's cache scope, so a metadata read and its
 * page counterpart each hit D1. Arguments are primitives and form the key,
 * typed so `1` and `"1"` stay apart; a rejected load is dropped so the next
 * caller retries.
 *
 * Nothing invalidates an entry: a server action and the page rerender that
 * follows it are one request, so an action must not read through a memoized
 * loader whose answer its own write changes (`requireSession` reads terms
 * straight from the database for that reason). */
export function requestMemo<Args extends MemoKey[], Result>(
  load: Loader<Args, Result>,
): Loader<Args, Result> {
  return (...args) => {
    const table = tables();
    let entries = table.get(load);
    if (!entries) table.set(load, (entries = new Map()));
    const key = JSON.stringify(args.map((arg) => [typeof arg, arg ?? null]));
    const pending = entries.get(key) as Promise<Result> | undefined;
    if (pending) return pending;
    const result = load(...args);
    entries.set(key, result);
    result.catch(() => {
      if (entries.get(key) === result) entries.delete(key);
    });
    return result;
  };
}
