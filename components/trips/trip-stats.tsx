import type { TripSummary } from "@/db/queries";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-sm text-muted">
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}

/** The three counts a trip carries on the owner's card and on its shared
 * page, so the two cannot disagree about what a number means. "Days logged"
 * is deliberately not the Analytics tab's "Days out": that tile counts
 * outdoor sessions in a single discipline, a narrower question, so it gets
 * its own words rather than a shared label over two different numbers. */
export function TripStats({
  trip,
}: {
  trip: Pick<TripSummary, "dayCount" | "entryCount" | "sendCount">;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Stat value={trip.dayCount} label={trip.dayCount === 1 ? "day logged" : "days logged"} />
      <Stat value={trip.entryCount} label={trip.entryCount === 1 ? "entry" : "entries"} />
      <Stat value={trip.sendCount} label={trip.sendCount === 1 ? "send" : "sends"} />
    </div>
  );
}
