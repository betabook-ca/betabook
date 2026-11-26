"use client";

import { useEffect, useState } from "react";

import { useClientSession } from "@/hooks/use-client-session";
import { localToday } from "@/lib/format-date";
import { yearReviewWindow } from "@/lib/year-in-review/window";

export type YearReviewStatus = {
  userId: string;
  year: number;
  active: boolean;
  daysOut: number;
  sends: number;
};

const CACHE_PREFIX = "betabook:year-review-status";
/** Short, so a climber who logs their first session of the year sees the
 * banner the same day. */
const CACHE_MS = 60 * 60 * 1000;

function readCache(key: string): YearReviewStatus | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; status: YearReviewStatus };
    return Date.now() - parsed.at < CACHE_MS ? parsed.status : null;
  } catch {
    return null;
  }
}

/** One request per user and year at a time: the banner and the journal card
 * mount together on the owner's journal and would otherwise both fetch. */
const inFlight = new Map<string, Promise<YearReviewStatus | null>>();

function fetchStatus(key: string, year: number): Promise<YearReviewStatus | null> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetch(`/api/year-review/status?year=${year}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const fetched: YearReviewStatus = await response.json();
      writeCache(key, fetched);
      return fetched;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

function writeCache(key: string, status: YearReviewStatus) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), status }));
  } catch {
    /* A convenience; the next page fetches again. */
  }
}

/**
 * The signed-in climber's recap status while the recap window is open, else
 * null. The date is checked in the browser first, in the climber's own
 * timezone, so outside Dec 1 – Jan 14 nothing is fetched. `alwaysOpen` comes
 * from the server's `YEAR_REVIEW_ALWAYS_OPEN` variable, for local testing.
 */
export function useYearReviewStatus(alwaysOpen: boolean): YearReviewStatus | null {
  const session = useClientSession();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<YearReviewStatus | null>(null);

  useEffect(() => {
    if (!userId) return;
    const year = yearReviewWindow(localToday(), alwaysOpen);
    if (year === null) return;
    const key = `${CACHE_PREFIX}:${userId}:${year}`;
    // The request is shared, so an unmounting component stops listening
    // rather than aborting it for the other.
    let active = true;
    async function show(recapYear: number) {
      const next = readCache(key) ?? (await fetchStatus(key, recapYear));
      if (active && next?.userId === userId) setStatus(next);
    }
    // No banner is the safe failure.
    show(year).catch(() => null);
    return () => {
      active = false;
    };
  }, [userId, alwaysOpen]);

  return status && status.userId === userId ? status : null;
}
