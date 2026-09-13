"use client";

import { useEffect, useRef, useState } from "react";

type PagedListPage<T, Meta> = {
  items: T[];
  hasMore: boolean;
  meta: Meta;
};

type Options<T, Meta> = {
  initialItems: T[];
  initialHasMore: boolean;
  initialMeta: Meta;
  itemKey: (item: T) => string | number;
  fetchPage: (
    offset: number,
    page: number,
    lastItem: T | undefined,
    signal: AbortSignal,
  ) => Promise<PagedListPage<T, Meta>>;
  mergeMeta: (current: Meta, incoming: Meta) => Meta;
};

/** Key the caller by its account/filter scope. A new server snapshot rechecks
 * the loaded depth without unmounting rows while the remaining pages load. */
export function usePagedList<T, Meta>({
  initialItems,
  initialHasMore,
  initialMeta,
  itemKey,
  fetchPage,
  mergeMeta,
}: Options<T, Meta>) {
  const callbacks = useRef({ fetchPage, itemKey, mergeMeta });
  useEffect(() => {
    callbacks.current = { fetchPage, itemKey, mergeMeta };
  });
  const loadController = useRef<AbortController | null>(null);
  const [state, setState] = useState(() => ({
    sourceItems: initialItems,
    items: initialItems,
    hasMore: initialHasMore,
    meta: initialMeta,
    pagesLoaded: 1,
    loadingMore: false,
    loadMoreFailed: false,
    refresh: null as { first: PagedListPage<T, Meta>; pagesLoaded: number } | null,
  }));

  // Keep one coherent list on screen until its replacement is ready. Re-fetch
  // the tail even when the first page is unchanged: its permissions may differ.
  if (state.sourceItems !== initialItems) {
    const first = { items: initialItems, hasMore: initialHasMore, meta: initialMeta };
    const refresh =
      state.pagesLoaded > 1 && initialHasMore ? { first, pagesLoaded: state.pagesLoaded } : null;
    setState({
      ...state,
      ...(refresh ? {} : { ...first, pagesLoaded: 1 }),
      sourceItems: initialItems,
      loadingMore: false,
      loadMoreFailed: false,
      refresh,
    });
  }

  useEffect(
    () => () => {
      loadController.current?.abort();
      loadController.current = null;
    },
    [initialItems],
  );

  const refresh = state.refresh;
  useEffect(() => {
    if (!refresh) return;
    const request = refresh;
    const controller = new AbortController();
    const { fetchPage, itemKey, mergeMeta } = callbacks.current;
    async function revalidate() {
      let next = request.first;
      let pagesLoaded = 1;
      try {
        while (next.hasMore && pagesLoaded < request.pagesLoaded) {
          const page = await fetchPage(
            next.items.length,
            pagesLoaded + 1,
            next.items.at(-1),
            controller.signal,
          );
          if (controller.signal.aborted) return;
          next = appendPage(next, page, itemKey, mergeMeta);
          pagesLoaded += 1;
        }
      } catch {
        // Never retain a tail whose current access/data could not be verified.
        // The new server-rendered first page is the last authoritative result.
        next = request.first;
        pagesLoaded = 1;
      }
      if (controller.signal.aborted) return;
      setState((current) =>
        current.refresh === refresh ? { ...current, ...next, pagesLoaded, refresh: null } : current,
      );
    }
    void revalidate();
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (loadController.current || state.refresh || !state.hasMore) return;

    const controller = new AbortController();
    loadController.current = controller;
    const sourceItems = state.sourceItems;
    setState((current) =>
      current.sourceItems === sourceItems
        ? { ...current, loadingMore: true, loadMoreFailed: false }
        : current,
    );

    try {
      const page = await fetchPage(
        state.items.length,
        state.pagesLoaded + 1,
        state.items.at(-1),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const next = appendPage(state, page, itemKey, mergeMeta);

      setState((current) =>
        current.sourceItems === sourceItems
          ? {
              ...current,
              ...next,
              pagesLoaded: current.pagesLoaded + 1,
              loadingMore: false,
            }
          : current,
      );
    } catch {
      if (controller.signal.aborted) return;
      setState((current) =>
        current.sourceItems === sourceItems
          ? { ...current, loadingMore: false, loadMoreFailed: true }
          : current,
      );
    } finally {
      if (loadController.current === controller) loadController.current = null;
    }
  }

  return {
    items: state.items,
    hasMore: state.hasMore,
    meta: state.meta,
    loadingMore: state.loadingMore || state.refresh !== null,
    loadMoreFailed: state.loadMoreFailed,
    loadMore,
  };
}

function appendPage<T, Meta>(
  current: PagedListPage<T, Meta>,
  page: PagedListPage<T, Meta>,
  itemKey: Options<T, Meta>["itemKey"],
  mergeMeta: Options<T, Meta>["mergeMeta"],
): PagedListPage<T, Meta> {
  const keys = new Set(current.items.map(itemKey));
  const items = page.items.filter((item) => {
    const key = itemKey(item);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  if (page.hasMore && items.length === 0) throw new Error("Paged response did not advance");
  return {
    items: [...current.items, ...items],
    hasMore: page.hasMore,
    meta: mergeMeta(current.meta, page.meta),
  };
}
