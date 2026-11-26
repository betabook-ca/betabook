"use client";

import { Sparkles } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { useYearReviewStatus } from "@/hooks/use-year-review-status";
import { yearReviewPath } from "@/lib/year-review-share";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The way back to the recap from the owner's journal, Dec 1 – Jan 14. Not
 * dismissable: it stays after the app-wide banner is dismissed. Rendered only
 * on the owner's own journal.
 */
export function YearReviewCard({ alwaysOpen }: { alwaysOpen: boolean }) {
  const status = useYearReviewStatus(alwaysOpen);
  if (!status?.active) return null;
  return (
    <aside
      aria-label={`Your ${status.year} year in review`}
      className={`flex flex-wrap items-center gap-3 ${cardClass("sm", "bordered")}`}
    >
      <Sparkles aria-hidden="true" className="size-5 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">Your {status.year} in climbing</span>
        <span className="text-sm text-muted">
          {plural(status.daysOut, "day")} out · {plural(status.sends, "send")}
        </span>
      </div>
      <AppLink
        href={yearReviewPath(status.userId, status.year)}
        className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
      >
        See your year
      </AppLink>
    </aside>
  );
}
