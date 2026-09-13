import { FeedActivityRow, FeedCardHeader, FEED_MORE_CLASS } from "@/components/feed-card-content";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import type { FeedDay } from "@/db/queries";
import type { FeedView } from "@/lib/feed";

export function FeedDayCard({ day, view }: { day: FeedDay; view: FeedView }) {
  const total = day.sends + day.repeats + day.sessions + day.training;
  const remaining = total - day.activities.length;
  const detail = `/users/${day.userId}/${view === "all" && day.journalVisible ? "journal" : "sends"}?date=${day.date}`;
  return (
    <article className={`overflow-hidden ${cardClass("none", "bordered")}`}>
      <FeedCardHeader
        authors={[{ id: day.userId, name: day.name, image: day.image }]}
        date={day.date}
        activityCount={total}
        dayHref={detail}
      />
      <div className="divide-y divide-separator">
        {day.activities.map((activity) => (
          <FeedActivityRow
            key={`${activity.kind}:${activity.id}`}
            entry={{ day, activity }}
            showCompanions={view === "all"}
          />
        ))}
        {remaining > 0 && (
          <AppLink href={detail} prefetch={false} className={FEED_MORE_CLASS}>
            See all activity ({remaining} more)
          </AppLink>
        )}
      </div>
    </article>
  );
}
