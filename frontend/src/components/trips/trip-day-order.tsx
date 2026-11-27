"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { SortDirectionButton } from "@/components/ui/sort-select";
import { TRIP_DAY_ORDER_PARAM, parseTripDayOrder, type TripDayOrder } from "@/lib/trip-days";
import { usePathname, useRouter, useSearchParams } from "@/spa/lib/navigation";

type TripDayOrderState = { order: TripDayOrder; toggle: () => void };

/** Without a provider, the days keep the server's order and nothing toggles. */
const TripDayOrderContext = createContext<TripDayOrderState>({
  order: "oldest",
  toggle: () => {},
});

/** Days are already loaded. Replacing this query parameter keeps the router,
 * the day cards, and a copied or restored trip URL in sync. */
export function TripDayOrderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const order = parseTripDayOrder(search.get(TRIP_DAY_ORDER_PARAM) ?? undefined);
  const toggle = useCallback(() => {
    const next = new URLSearchParams(search);
    if (order === "oldest") next.set(TRIP_DAY_ORDER_PARAM, "newest");
    else next.delete(TRIP_DAY_ORDER_PARAM);
    const suffix = next.toString();
    router.replace(pathname + (suffix ? "?" + suffix : "") + window.location.hash, {
      scroll: false,
    });
  }, [pathname, search, router, order]);
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
