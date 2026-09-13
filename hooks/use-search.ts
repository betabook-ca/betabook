"use client";

import { useEffect, useRef, useState } from "react";

import { AuthenticationRequiredError } from "@/lib/api-client";
import {
  SEARCH_KINDS,
  searchHref,
  type SearchFetcher,
  type SearchKind,
  type SearchPage,
  type SearchSnapshot,
  type SearchState,
  type SearchStatus,
} from "@/lib/search";
import { fetchSearchPage } from "@/lib/search-client";

const emptyPage = (): SearchPage => ({ items: [], hasMore: false, nextPage: 1 });

/** Each category fails and retries independently. Old query results are never actionable. */
function useSearchSection(
  state: SearchState,
  kind: SearchKind,
  enabled: boolean,
  fetcher: SearchFetcher,
  initial?: SearchSnapshot[number],
) {
  const identity = JSON.stringify([searchHref(state), enabled]);
  const [retry, setRetry] = useState(0);
  const key = `${identity}:${retry}`;
  const [observed, setObserved] = useState(key);
  const [settled, setSettled] = useState({
    key,
    page: initial?.page ?? emptyPage(),
    status: initial?.status ?? ((enabled ? "loading" : "idle") as SearchStatus),
  });
  const [more, setMore] = useState({ key, loading: false, failed: false });
  const first = useRef(true);
  const previousIdentity = useRef(identity);
  const seed = useRef(initial);
  const request = useRef<{
    controller: AbortController;
    key: string;
    loadingMore?: boolean;
  } | null>(null);
  const latest = useRef({ state, fetcher });
  useEffect(() => {
    latest.current = { state, fetcher };
  });
  if (observed !== key) {
    setObserved(key);
    setSettled((old) => ({ ...old, key, status: enabled ? "loading" : "idle" }));
  }
  useEffect(() => {
    const retryOnly = previousIdentity.current === identity && retry > 0;
    previousIdentity.current = identity;
    const controller = new AbortController();
    request.current = { controller, key };
    const useInitial = initial !== undefined && (first.current || seed.current !== initial);
    seed.current = initial;
    if (useInitial) setSettled({ key, page: initial.page, status: initial.status });
    first.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (enabled && !useInitial) {
      timer = setTimeout(
        () => {
          void latest.current
            .fetcher(latest.current.state, kind, 1, controller.signal)
            .then((page) => {
              if (!controller.signal.aborted) setSettled({ key, page, status: "ready" });
              return undefined;
            })
            .catch((error: unknown) => {
              if (!controller.signal.aborted)
                setSettled({
                  key,
                  page: emptyPage(),
                  status: error instanceof AuthenticationRequiredError ? "locked" : "error",
                });
            });
        },
        retryOnly ? 0 : 300,
      );
    }
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, identity, enabled, kind, retry, initial]);

  async function loadMore() {
    const current = request.current;
    if (
      !enabled ||
      settled.status !== "ready" ||
      !settled.page.hasMore ||
      !current ||
      current.key !== key ||
      current.controller.signal.aborted ||
      (more.key === key && more.loading) ||
      current.loadingMore
    )
      return;
    current.loadingMore = true;
    setMore({ key, loading: true, failed: false });
    try {
      const page = await fetcher(state, kind, settled.page.nextPage, current.controller.signal);
      if (current.controller.signal.aborted) return;
      setSettled((old) => ({
        ...old,
        page: {
          ...page,
          items: [
            ...old.page.items,
            ...page.items.filter(
              (item) => !old.page.items.some((existing) => existing.id === item.id),
            ),
          ],
        },
      }));
      setMore({ key, loading: false, failed: false });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError && !current.controller.signal.aborted)
        setSettled({ key, page: emptyPage(), status: "locked" });
      if (!current.controller.signal.aborted) setMore({ key, loading: false, failed: true });
    } finally {
      current.loadingMore = false;
    }
  }
  const status = !enabled ? "idle" : observed !== key ? "loading" : settled.status;
  return {
    section: {
      kind,
      items: enabled ? settled.page.items : [],
      hasMore: status === "ready" && settled.page.hasMore,
      status,
    },
    retry: () => setRetry((value) => value + 1),
    loadMore,
    loadingMore: more.key === key && more.loading,
    loadMoreFailed: more.key === key && more.failed,
  };
}

export function useSearch({
  state,
  enabled = true,
  initial,
  fetcher = fetchSearchPage,
  preview = false,
  publicOnly = false,
}: {
  state: SearchState;
  enabled?: boolean;
  initial?: SearchSnapshot;
  fetcher?: SearchFetcher;
  preview?: boolean;
  publicOnly?: boolean;
}) {
  const active = (kind: SearchKind) =>
    enabled &&
    !(publicOnly && kind === "climber") &&
    (state.category === "all" || state.category === kind) &&
    state.query.trim().length > 0;
  const climb = useSearchSection(
    state,
    "climb",
    active("climb"),
    fetcher,
    initial?.find((item) => item.kind === "climb"),
  );
  const area = useSearchSection(
    state,
    "area",
    active("area"),
    fetcher,
    initial?.find((item) => item.kind === "area"),
  );
  const climber = useSearchSection(
    state,
    "climber",
    active("climber"),
    fetcher,
    initial?.find((item) => item.kind === "climber"),
  );
  const controllers = { climb, area, climber };
  const kinds = state.category === "all" ? SEARCH_KINDS : [state.category];
  const sections = kinds.map((kind) => {
    const section =
      publicOnly && kind === "climber"
        ? { kind, items: [], status: "locked" as const, hasMore: false }
        : controllers[kind].section;
    return {
      ...section,
      items: preview || state.category === "all" ? section.items.slice(0, 3) : section.items,
    };
  });
  const selected = state.category === "all" ? climb : controllers[state.category];
  return {
    sections,
    retry: (kind: SearchKind) => controllers[kind].retry(),
    loadMore: selected.loadMore,
    loadingMore: selected.loadingMore,
    loadMoreFailed: selected.loadMoreFailed,
  };
}
