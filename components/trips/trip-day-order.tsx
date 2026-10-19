"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useReportNavigationPending } from "@/components/navigation-pending";
import { SortDirectionButton } from "@/components/ui/sort-select";
import type { TripDayOrderLinks } from "@/lib/trip-days";

/** The Sends tab's sort-direction arrow, wired to the trip's day order:
 * ascending is oldest day first. The server builds both URLs, so each keeps
 * the page's share token. */
export function TripDayOrderControl({ order }: { order: TripDayOrderLinks }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  useReportNavigationPending(isPending);

  const next = order.value === "oldest" ? "newest" : "oldest";
  return (
    <SortDirectionButton
      direction={order.value === "oldest" ? "asc" : "desc"}
      isDisabled={isPending}
      onPress={() => startTransition(() => router.replace(order.hrefs[next], { scroll: false }))}
    />
  );
}
