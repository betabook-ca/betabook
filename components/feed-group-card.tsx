import {
  FeedActivityRow,
  FeedCardHeader,
  FeedClimbContext,
  FEED_MORE_CLASS,
} from "@/components/feed-card-content";
import { cardClass } from "@/components/ui/card";
import type { FeedCard, FeedEntry } from "@/lib/feed-groups";
import { formatDate } from "@/lib/format-date";

export function FeedGroupCard({ group }: { group: Extract<FeedCard, { kind: "group" }> }) {
  const first = group.entries[0].activity;
  const authors = [
    ...new Map(
      group.entries.map(({ day }) => [
        day.userId,
        { id: day.userId, name: day.name, image: day.image },
      ]),
    ).values(),
  ];
  const heading = group.entryKind === "climb" ? (first.climbName ?? "Climb activity") : "Training";
  const row = (entry: FeedEntry) => (
    <FeedActivityRow
      key={`${entry.day.userId}:${entry.activity.kind}:${entry.activity.id}`}
      entry={entry}
      grouped
    />
  );
  return (
    <article
      aria-label={`${heading} on ${formatDate(group.date)}`}
      className={`overflow-hidden ${cardClass("none", "bordered")}`}
    >
      <FeedCardHeader authors={authors} date={group.date} />
      <div className="border-b border-separator">
        {group.entryKind === "climb" ? (
          <FeedClimbContext activity={first} />
        ) : (
          <h3 className="px-4 py-3 font-medium">Training</h3>
        )}
      </div>
      <div className="divide-y divide-separator">{group.entries.slice(0, 2).map(row)}</div>
      {group.entries.length > 2 && (
        <details className="group border-t border-separator">
          <summary className={`${FEED_MORE_CLASS} list-none [&::-webkit-details-marker]:hidden`}>
            <span className="group-open:hidden">
              See all activity ({group.entries.length - 2} more)
            </span>
            <span className="hidden group-open:inline">Show less</span>
          </summary>
          <div className="divide-y divide-separator border-t border-separator">
            {group.entries.slice(2).map(row)}
          </div>
        </details>
      )}
    </article>
  );
}
