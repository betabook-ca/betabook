"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { SortDirectionButton } from "@/components/ui/sort-select";
import { TRIP_DAY_ORDER_PARAM, type TripDayOrder } from "@/lib/trip-days";

type TripDayOrderState = { order: TripDayOrder; toggle: () => void };

/** Without a provider, the days keep the server's order and nothing toggles. */
const TripDayOrderContext = createContext<TripDayOrderState>({
  order: "oldest",
  toggle: () => {},
});

/** Holds the trip page's day order for the heading's arrow and the list below
 * it. Every day is already on the page, so switching order only reverses the
 * cards here: nothing is fetched and the page isn't re-rendered. The URL is
 * updated with `history.replaceState`, so a reload or a copied link keeps the
 * order, along with the rest of the query such as the share token. */
export function TripDayOrderProvider({
  initialOrder,
  children,
}: {
  initialOrder: TripDayOrder;
  children: ReactNode;
}) {
  const [order, setOrder] = useState(initialOrder);
  const toggle = useCallback(() => {
    const next = order === "oldest" ? "newest" : "oldest";
    setOrder(next);
    const url = new URL(window.location.href);
    if (next === "newest") url.searchParams.set(TRIP_DAY_ORDER_PARAM, next);
    else url.searchParams.delete(TRIP_DAY_ORDER_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, [order]);
  const value = useMemo(() => ({ order, toggle }), [order, toggle]);
  return <TripDayOrderContext value={value}>{children}</TripDayOrderContext>;
}

/** The Sends tab's sort-direction arrow: ascending is oldest day first. */
export function TripDayOrderControl() {
  const { order, toggle } = useContext(TripDayOrderContext);
  return <SortDirectionButton direction={order === "oldest" ? "asc" : "desc"} onPress={toggle} />;
}

/** Shows the day cards, which the server sends oldest first and keyed by
 * date, in the current order. */
export function TripDayOrderList({ days }: { days: ReactNode[] }) {
  const { order } = useContext(TripDayOrderContext);
  return order === "newest" ? days.toReversed() : days;
}
