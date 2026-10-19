"use client";

import { Button, Tooltip } from "@heroui/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useReportNavigationPending } from "@/components/navigation-pending";
import type { TripDayOrderLinks } from "@/lib/trip-days";

/** One icon button beside the days heading. The arrow shows the current
 * order (up for oldest first, down for newest first); the label and tooltip
 * say what pressing it does. The server builds both URLs, so each keeps the
 * page's share token. */
export function TripDayOrderControl({ order }: { order: TripDayOrderLinks }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  useReportNavigationPending(isPending);

  const next = order.value === "oldest" ? "newest" : "oldest";
  const label = next === "newest" ? "Show newest day first" : "Show oldest day first";
  const Icon = order.value === "oldest" ? ArrowUp : ArrowDown;

  return (
    <Tooltip.Root delay={200}>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={label}
        isDisabled={isPending}
        onPress={() => startTransition(() => router.replace(order.hrefs[next], { scroll: false }))}
      >
        <Icon aria-hidden className="size-4" />
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip.Root>
  );
}
