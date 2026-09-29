import { Fragment, type ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import type { TripSummary } from "@/db/queries";

type Links = { entries: string; sends: string };

function Stat({ value, label, href }: { value: number; label: string; href?: string }) {
  // Only link counts above zero.
  if (href && value > 0) {
    return (
      <AppLink href={href} className="text-sm">
        {value} {label}
      </AppLink>
    );
  }
  return (
    <span>
      <span className="font-medium text-foreground tabular-nums">{value}</span> {label}
    </span>
  );
}

/** "Days logged" is not the Analytics "Days out" tile, which counts outdoor
 * sessions for one discipline, so it has its own label. Journal counts are left
 * out, not shown as zero, when the viewer can't read the journal. */
export function TripStats({
  trip,
  links,
}: {
  trip: Pick<TripSummary, "dayCount" | "entryCount" | "sendCount">;
  /** Links for the counts. Omit for signed-out visitors. */
  links?: Links;
}) {
  const stats: { key: string; stat: ReactNode }[] = [];
  if (trip.dayCount != null) {
    stats.push({
      key: "days",
      stat: (
        <Stat value={trip.dayCount} label={trip.dayCount === 1 ? "day logged" : "days logged"} />
      ),
    });
  }
  if (trip.entryCount != null) {
    stats.push({
      key: "entries",
      stat: (
        <Stat
          value={trip.entryCount}
          label={trip.entryCount === 1 ? "entry" : "entries"}
          href={links?.entries}
        />
      ),
    });
  }
  stats.push({
    key: "sends",
    stat: (
      <Stat
        value={trip.sendCount}
        label={trip.sendCount === 1 ? "send" : "sends"}
        href={links?.sends}
      />
    ),
  });

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
      {stats.map(({ key, stat }, index) => (
        <Fragment key={key}>
          {index > 0 && <span aria-hidden>·</span>}
          {stat}
        </Fragment>
      ))}
    </p>
  );
}
