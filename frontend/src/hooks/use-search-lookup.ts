"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { SearchStatus } from "@/lib/search";

export type LookupFetcher<T> = (query: string, signal: AbortSignal) => Promise<T[]>;

/** A lookup binds identity only after selection; pending results stay inert. */
export function useSearchLookup<T>({
  query,
  fetcher,
  scope = "",
  enabled = true,
}: {
  query: string;
  fetcher: LookupFetcher<T>;
  scope?: string;
  enabled?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const identity = JSON.stringify([query.trim(), scope, enabled]);
  const key = `${identity}:${attempt}`;
  const previousIdentity = useRef(identity);
  const [settled, setSettled] = useState<{ key: string; items: T[]; status: SearchStatus }>({
    key: "",
    items: [],
    status: "idle",
  });
  const fetchLatest = useEffectEvent((text: string, signal: AbortSignal) => fetcher(text, signal));
  useEffect(() => {
    const retryOnly = previousIdentity.current === identity && attempt > 0;
    previousIdentity.current = identity;
    if (!query.trim() || !enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void fetchLatest(query.trim(), controller.signal)
          .then((items) => {
            if (!controller.signal.aborted) setSettled({ key, items, status: "ready" });
            return undefined;
          })
          .catch(() => {
            if (!controller.signal.aborted) setSettled({ key, items: [], status: "error" });
          });
      },
      retryOnly ? 0 : 300,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, identity, query, enabled, attempt]);
  const active = enabled && !!query.trim();
  return {
    items: active && settled.key === key ? settled.items : [],
    status: !active ? "idle" : settled.key === key ? settled.status : "loading",
    retry: () => setAttempt((value) => value + 1),
  };
}
