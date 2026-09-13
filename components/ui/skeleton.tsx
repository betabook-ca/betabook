import { clsx } from "clsx";

import { cardClass } from "@/components/ui/card";

const TONE_CLASSNAME = {
  /** Sits directly on the page background. */
  base: "bg-surface-secondary",
  /** Sits inside a bg-surface-secondary panel — one surface step up so the
   * placeholder stays visible against the panel. */
  raised: "bg-surface-tertiary",
} as const;

type SkeletonProps = {
  className?: string;
  tone?: keyof typeof TONE_CLASSNAME;
  /** Corner radius utility. A prop rather than part of `className` because
   * Tailwind emits `rounded-md` after `rounded-full`/`rounded-lg`, so a
   * radius passed alongside a default one silently lost. */
  rounded?: string;
};

/** Base pulsing placeholder block — size it via className (h-*, w-*). The
 * app's only skeleton; the header controls use it too, so every loading
 * surface pulses the same way. */
export function Skeleton({ className, tone = "base", rounded = "rounded-md" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={clsx("animate-pulse", rounded, TONE_CLASSNAME[tone], className)}
    />
  );
}

/** Placeholder for a list of ListRow entries — mirrors its route-table
 * px-4 py-3 density and the divide-y separators the real lists use. */
export function SkeletonListRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-separator">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a StatStrip card — the same card surface with
 * label/value line pairs inside. */
export function SkeletonStatCard({ stats = 3 }: { stats?: number }) {
  return (
    <div className={cardClass("sm")}>
      <div className="flex flex-col gap-3">
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <Skeleton tone="raised" className="h-3 w-24" />
            <Skeleton tone="raised" className="h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors FeedDayCard's bordered shell, compact header and flush list rows. */
export function SkeletonFeedCard() {
  return (
    <div className={`overflow-hidden ${cardClass("none", "bordered")}`}>
      <div className="flex items-center gap-3 border-b border-separator p-4">
        <Skeleton className="size-8 shrink-0" rounded="rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
        <Skeleton className="h-3 w-16" />
      </div>
      <SkeletonListRows rows={3} />
    </div>
  );
}
