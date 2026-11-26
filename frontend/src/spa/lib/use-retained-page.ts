import { useEffect, useEffectEvent, useState } from "react";

import { TermsAcceptanceRequiredError } from "@/lib/action-result";
import { AuthenticationRequiredError } from "@/lib/api-client";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type Snapshot<T> = { scope: string; query: string; revision: number; data: T };
type Failure = { scope: string; query: string; revision: number; cause: unknown };

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
  const current = snapshot?.scope === scope ? snapshot : null;
  const request = useEffectEvent(async (signal: AbortSignal) => {
    if (snapshot && snapshot.scope !== scope) setSnapshot(null);
    if (failure && failure.scope !== scope) setFailure(null);
    if (!scope || (current?.query === query && current.revision === revision)) return;
    try {
      const data =
        refine && current && current.revision === revision
          ? await refine(current.data, current.query, signal)
          : await load(signal);
      if (signal.aborted) return;
      setSnapshot({ scope, query, revision, data });
      setFailure(null);
    } catch (cause) {
      if (signal.aborted) return;
      const status = cause instanceof Error && "status" in cause ? cause.status : undefined;
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        status === 428 ||
        cause instanceof AuthenticationRequiredError ||
        cause instanceof TermsAcceptanceRequiredError
      ) {
        setSnapshot(null);
      }
      setFailure({ scope, query, revision, cause });
    }
  });
  useEffect(() => {
    const controller = new AbortController();
    void request(controller.signal);
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
