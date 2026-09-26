"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { GoalPage } from "@/lib/goals";

/** Preserve the selected year and loaded depth when server data is refreshed. */
export function useGoalPages(
  initial: GoalPage,
  today: string,
  fetchPage: (year: number, offset: number, signal: AbortSignal) => Promise<GoalPage>,
) {
  const [state, setState] = useState(() => ({
    page: initial,
    year: initial.summary?.year ?? Number(today.slice(0, 4)),
    /** The year a whole-list request is in flight for; the rows still belong to `year`. */
    pendingYear: null as number | null,
    loading: false,
    moreFailed: false,
    error: "",
  }));
  const source = useRef(initial);
  const request = useRef<AbortController | null>(null);
  const retryYear = useRef<number | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function load(year: number, append: boolean, serverPage?: GoalPage) {
    if (append && request.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    retryYear.current = null;
    const previous = state;
    setState((value) => ({
      ...value,
      pendingYear: append ? value.pendingYear : year,
      loading: true,
      moreFailed: false,
      error: "",
    }));
    let authoritative: GoalPage | undefined;
    try {
      let page =
        serverPage?.summary?.year === year
          ? serverPage
          : await fetchPage(year, append ? previous.page.goals.length : 0, controller.signal);
      if (controller.signal.aborted) return;
      authoritative = page;
      if (append) page = { ...page, goals: [...previous.page.goals, ...page.goals] };
      if (serverPage) {
        while (page.hasMore && page.goals.length < previous.page.goals.length) {
          const tail = await fetchPage(year, page.goals.length, controller.signal);
          if (controller.signal.aborted) return;
          page = { ...tail, goals: [...page.goals, ...tail.goals] };
          if (tail.goals.length === 0) break;
        }
      }
      setState({ page, year, pendingYear: null, loading: false, moreFailed: false, error: "" });
    } catch {
      if (controller.signal.aborted) return;
      if (!append) retryYear.current = year;
      setState((value) => ({
        ...value,
        ...(serverPage
          ? { page: authoritative ?? { goals: [], hasMore: false, total: 0, years: initial.years } }
          : {}),
        pendingYear: null,
        loading: false,
        moreFailed: append,
        error: append ? "" : "Couldn't refresh goals. Try again.",
      }));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  const reload = useEffectEvent((serverPage: GoalPage) => load(state.year, false, serverPage));
  useEffect(() => {
    if (source.current === initial) return;
    source.current = initial;
    void reload(initial);
  }, [initial]);
  return {
    ...state,
    changeYear: (value: string) => load(Number(value), false),
    more: () => load(state.year, true),
    retry: () => load(retryYear.current ?? state.year, false),
  };
}
