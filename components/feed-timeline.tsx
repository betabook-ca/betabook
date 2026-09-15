import { Fragment } from "react";

import { FeedActivityCard } from "@/components/feed-activity-card";
import { AppLink } from "@/components/ui/app-link";
import type { FeedDay } from "@/db/queries/feed";
import { feedDayHref, type FeedView } from "@/lib/feed";
import { buildFeedCards, type FeedCard } from "@/lib/feed-groups";
import { formatDate } from "@/lib/format-date";

export function FeedTimeline({
  days,
  view,
  links = true,
}: {
  days: FeedDay[];
  view: FeedView;
  links?: boolean;
}) {
  const dates = new Map<string, FeedCard[]>();
  for (const card of buildFeedCards(days, view)) {
    const date = card.kind === "group" ? card.date : card.day.date;
    const cards = dates.get(date) ?? [];
    cards.push(card);
    dates.set(date, cards);
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {[...dates].map(([date, cards]) => (
        <section key={date} aria-label={formatDate(date)} className="flex min-w-0 flex-col gap-3">
          <h2 className="flex items-center gap-3 text-xs font-medium text-muted">
            <time dateTime={date}>{formatDate(date)}</time>
            <span aria-hidden className="h-px flex-1 bg-separator" />
          </h2>
          {cards.map((card) => {
            if (card.kind === "group")
              return (
                <FeedActivityCard key={card.key} entries={card.entries} view={view} links={links} />
              );
            const { day } = card;
            const remaining =
              day.sends + day.repeats + day.sessions + day.training - day.activities.length;
            const label = `See ${remaining} more ${remaining === 1 ? "activity" : "activities"} from ${day.name}`;
            return (
              <Fragment key={card.key}>
                {day.activities.map((activity) => (
                  <FeedActivityCard
                    key={`${activity.kind}:${activity.id}`}
                    entries={[{ day, activity }]}
                    view={view}
                    links={links}
                  />
                ))}
                {remaining > 0 &&
                  (links ? (
                    <AppLink
                      href={feedDayHref(day, view)}
                      prefetch={false}
                      className="self-start py-2 text-sm"
                    >
                      {label}
                    </AppLink>
                  ) : (
                    <p className="text-sm text-muted">
                      {remaining} more activities from {day.name}
                    </p>
                  ))}
              </Fragment>
            );
          })}
        </section>
      ))}
    </div>
  );
}
