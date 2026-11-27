import { useEffect, useEffectEvent, useState } from "react";

import { TermsAcceptanceRequiredError } from "@/lib/action-result";
import { AuthenticationRequiredError } from "@/lib/api-client";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type Snapshot<T> = { scope: string; query: string; revision: number; data: T };
type Failure = { scope: string; query: string; revision: number; cause: unknown };

function invalidatesAccess(cause: unknown) {
  if (cause instanceof AuthenticationRequiredError || cause instanceof TermsAcceptanceRequiredError)
    return true;
  if (!(cause instanceof Error) || !("status" in cause)) return false;
  return [401, 403, 404, 428].some((status) => status === cause.status);
}

/** Keep the workspace mounted on filter changes. Full loads revalidate its
 * metadata after a mutation. Scope includes every identity or share credential
 * needed to display the snapshot. A late reply cannot revive a previous scope. */
export function useRetainedPage<T>({
  scope,
  query,
  initial,
  load,
  refine,
}: {
  scope: string | null;
  query: string;
  load: (signal: AbortSignal) => Promise<T>;
  initial?: () => T | null;
  refine?: (previous: T, previousQuery: string, signal: AbortSignal) => Promise<T>;
}) {
  const revision = useRouterRefreshKey();
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(() => {
    const data = scope ? initial?.() : null;
    return scope && data != null ? { scope, query, revision, data } : null;
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  if (snapshot && snapshot.scope !== scope) setSnapshot(null);
  if (
    failure &&
    (failure.scope !== scope || failure.query !== query || failure.revision !== revision)
  )
    setFailure(null);
  const current = snapshot?.scope === scope ? snapshot : null;
  const request = useEffectEvent(async (signal: AbortSignal): Promise<Snapshot<T> | null> => {
    if (!scope || (current?.query === query && current.revision === revision)) return null;
    const data =
      refine && current && current.revision === revision
        ? await refine(current.data, current.query, signal)
        : await load(signal);
    return { scope, query, revision, data };
  });
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    async function update(target: string) {
      try {
        const next = await request(controller.signal);
        if (!next || controller.signal.aborted) return;
        setSnapshot(next);
        setFailure(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (invalidatesAccess(cause)) setSnapshot(null);
        setFailure({ scope: target, query, revision, cause });
      }
    }
    void update(scope);
    return () => controller.abort();
  }, [scope, query, revision]);
  const error =
    failure?.scope === scope && failure.query === query && failure.revision === revision
      ? failure.cause
      : null;
  return {
    data: current?.data,
    query: current?.query,
    pending: Boolean(
      current && !error && (current.query !== query || current.revision !== revision),
    ),
    error,
  };
}
