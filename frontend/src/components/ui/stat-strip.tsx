import { clsx } from "clsx";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";

type Stat = { label: string; value: ReactNode };
type StatCard = { key: string; heading?: ReactNode; stats: Stat[] };

type StatStripProps = {
  cards: StatCard[];
  className?: string;
};

/** A row of stat cards beside main content on wide screens, and a horizontal
 * strip above it on narrow screens — one component, no fixed sidebar that'd
 * push content below the fold on mobile. */
export function StatStrip({ cards, className }: StatStripProps) {
  if (cards.length === 0) return null;

  return (
    <div className={clsx("flex flex-row flex-wrap gap-4 lg:w-full lg:flex-col", className)}>
      {cards.map((card) => (
        <div key={card.key} className={clsx("min-w-56 flex-1 lg:min-w-0", cardClass("sm"))}>
          {card.heading && <div className="mb-3">{card.heading}</div>}
          <div className="flex flex-col gap-2">
            {card.stats.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between gap-2">
                <span className={EYEBROW_CLASS}>{stat.label}</span>
                <span className="font-semibold text-foreground tabular-nums">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
