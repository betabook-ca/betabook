import { useEffect, useEffectEvent, useState } from "react";

import { TermsAcceptanceRequiredError } from "@/lib/action-result";
import { AuthenticationRequiredError } from "@/lib/api-client";
import {
  forgetPageScope,
  pageGeneration,
  readPageCache,
  writePageCache,
} from "@/spa/lib/page-cache";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

/** `cached` marks data shown from an earlier visit while the loader runs
 * again: "fresh" when nothing has changed since, "stale" when a mutation or an
 * explicit refresh has happened since it was loaded. */
type Snapshot<T> = {
  scope: string;
  query: string;
  revision: number;
  data: T;
  cached?: "fresh" | "stale";
};
type Failure = { scope: string; query: string; revision: number; cause: unknown };

function cachedSnapshot<T>(resource: string, scope: string, query: string, revision: number) {
  const hit = readPageCache(resource, scope, query);
  if (!hit) return null;
  const snapshot: Snapshot<T> = {
    scope,
    query,
    revision,
    data: hit.data as T,
    cached: hit.freshness,
  };
  return snapshot;
}

function invalidatesAccess(cause: unknown) {
  if (cause instanceof AuthenticationRequiredError || cause instanceof TermsAcceptanceRequiredError)
    return true;
  if (!(cause instanceof Error) || !("status" in cause)) return false;
  return [401, 403, 404, 428].some((status) => status === cause.status);
}

/** Keep the workspace mounted on filter changes. Full loads revalidate its
 * metadata after a mutation. Scope includes every identity or share credential
 * needed to display the snapshot. A late reply cannot revive a previous scope.
 * `resource` names the loader, so pages sharing a scope keep separate results. */
export function useRetainedPage<T>({
  resource,
  scope,
  query,
  initial,
  load,
  refine,
}: {
  resource: string;
  scope: string | null;
  query: string;
  load: (signal: AbortSignal) => Promise<T>;
  initial?: () => T | null;
  refine?: (previous: T, previousQuery: string, signal: AbortSignal) => Promise<T>;
}) {
  const revision = useRouterRefreshKey();
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(() => {
    if (!scope) return null;
    const data = initial?.();
    if (data != null) return { scope, query, revision, data };
    return cachedSnapshot<T>(resource, scope, query, revision);
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  if (snapshot && snapshot.scope !== scope)
    setSnapshot(scope ? cachedSnapshot<T>(resource, scope, query, revision) : null);
  if (
    failure &&
    (failure.scope !== scope || failure.query !== query || failure.revision !== revision)
  )
    setFailure(null);
  const current = snapshot?.scope === scope ? snapshot : null;
  const request = useEffectEvent(async (signal: AbortSignal): Promise<Snapshot<T> | null> => {
    if (!scope) return null;
    if (current?.query === query && current.revision === revision && !current.cached) {
      writePageCache(resource, current.scope, current.query, current.data, pageGeneration());
      return null;
    }
    // A cached result is only a placeholder: reload it whole rather than
    // refining it, since it may predate changes to the page's metadata.
    const data =
      refine && current && !current.cached && current.revision === revision
        ? await refine(current.data, current.query, signal)
        : await load(signal);
    return { scope, query, revision, data };
  });
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    async function update(target: string) {
      const loadedAt = pageGeneration();
      try {
        const next = await request(controller.signal);
        if (!next || controller.signal.aborted) return;
        setSnapshot(next);
        setFailure(null);
        writePageCache(resource, next.scope, next.query, next.data, loadedAt);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (invalidatesAccess(cause)) {
          setSnapshot(null);
          forgetPageScope(resource, target);
        }
        setFailure({ scope: target, query, revision, cause });
      }
    }
    void update(scope);
    return () => controller.abort();
  }, [resource, scope, query, revision]);
  const error =
    failure?.scope === scope && failure.query === query && failure.revision === revision
      ? failure.cause
      : null;
  return {
    data: current?.data,
    query: current?.query,
    pending: Boolean(
      current &&
      !error &&
      (current.query !== query || current.revision !== revision || current.cached === "stale"),
    ),
    error,
  };
}
