import type { TripSummary } from "@/db/queries";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-medium text-foreground tabular-nums">{value}</span> {label}
    </span>
  );
}

function Separator() {
  return <span aria-hidden>·</span>;
}

/** "Days logged" is deliberately not the Analytics tab's "Days out": that
 * tile counts outdoor sessions in a single discipline, a narrower question,
 * so it gets its own words rather than a shared label over two different
 * numbers. The journal's two counts are absent, not zero, for a reader the
 * journal is not shared with. */
export function TripStats({
  trip,
}: {
  trip: Pick<TripSummary, "dayCount" | "entryCount" | "sendCount">;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
      {trip.dayCount != null && (
        <>
          <Stat value={trip.dayCount} label={trip.dayCount === 1 ? "day logged" : "days logged"} />
          <Separator />
        </>
      )}
      {trip.entryCount != null && (
        <>
          <Stat value={trip.entryCount} label={trip.entryCount === 1 ? "entry" : "entries"} />
          <Separator />
        </>
      )}
      <Stat value={trip.sendCount} label={trip.sendCount === 1 ? "send" : "sends"} />
    </p>
  );
}
