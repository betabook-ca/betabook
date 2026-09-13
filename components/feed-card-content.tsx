import { Button, Chip, Tooltip } from "@heroui/react";
import { ExternalLink } from "lucide-react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { AscentStyle } from "@/components/ascent-style";
import { CompanionList } from "@/components/journal/companion-list";
import { AppLink } from "@/components/ui/app-link";
import { Grade, GradeArrow } from "@/components/ui/grade";
import { ListRow } from "@/components/ui/list-row";
import { UserAvatarStack } from "@/components/ui/user-avatar-stack";
import type { FeedDay } from "@/db/queries/feed";
import type { FeedEntry } from "@/lib/feed-groups";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";
import { formatGrade } from "@/lib/grades";
import { climbHref } from "@/lib/slug";

export const FEED_MORE_CLASS =
  "block cursor-pointer px-4 py-3 text-center text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary focus-visible:status-focused";

export function FeedCardHeader({
  authors,
  date,
  activityCount,
  dayHref,
  profileLinks = true,
}: {
  authors: ReadonlyArray<{ id: string; name: string; image?: string | null }>;
  date: string;
  activityCount?: number;
  dayHref?: string;
  profileLinks?: boolean;
}) {
  const authorName = (author: (typeof authors)[number]) =>
    profileLinks ? (
      <AppLink href={`/users/${author.id}`} className="text-foreground">
        {author.name}
      </AppLink>
    ) : (
      author.name
    );
  return (
    <header className="flex items-center gap-3 border-b border-separator p-4">
      <UserAvatarStack users={authors} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold break-words">
          {authorName(authors[0])}
          {authors.length > 1 && " and "}
          {authors.length === 2 && authorName(authors[1])}
          {authors.length > 2 && (
            <Tooltip.Root delay={200}>
              <Button
                size="sm"
                variant="ghost"
                className="h-auto min-w-0 cursor-help p-0 text-sm font-semibold underline decoration-dotted underline-offset-4"
              >
                {formatCount(authors.length - 1, "other")}
              </Button>
              <Tooltip.Content placement="bottom" className="max-h-80 max-w-xs overflow-y-auto">
                <ul className="flex flex-col gap-1 text-left">
                  {authors.slice(1).map((author) => (
                    <li key={author.id} className="break-words">
                      {author.name}
                    </li>
                  ))}
                </ul>
              </Tooltip.Content>
            </Tooltip.Root>
          )}
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
          <time dateTime={date}>{formatDate(date)}</time>
          {activityCount != null && (
            <span>· {formatCount(activityCount, "activity", "activities")}</span>
          )}
        </div>
      </div>
      {dayHref && <DayLink href={dayHref} name={authors[0].name} date={date} />}
    </header>
  );
}

function DayLink({ href, name, date }: { href: string; name: string; date: string }) {
  return (
    <AppLink
      href={href}
      prefetch={false}
      aria-label={`View activity for ${name} on ${formatDate(date)}`}
      title={`View ${name}'s day`}
      className="inline-flex size-8 shrink-0 items-center justify-center text-muted"
    >
      <ExternalLink aria-hidden="true" className="size-3.5" />
    </AppLink>
  );
}

function climbRowProps(activity: FeedDay["activities"][number]) {
  return {
    title: activity.climbName ?? "Training",
    href:
      activity.climbId && activity.climbName
        ? climbHref(activity.climbId, activity.climbName)
        : undefined,
    subtitle:
      activity.areaId && activity.areaName ? (
        <AreaBreadcrumb
          areaId={activity.areaId}
          areaName={activity.areaName}
          ancestors={activity.areaAncestors ?? []}
        />
      ) : undefined,
  };
}

function FeedReportedGrade({
  activity,
}: {
  activity: Pick<
    FeedDay["activities"][number],
    "climbType" | "climbGrade" | "reportedGrade" | "gradeFeel"
  >;
}) {
  const { climbType, climbGrade, reportedGrade, gradeFeel } = activity;
  if (!climbType) return null;
  return (
    <Grade>
      {reportedGrade == null ? (
        <span className="font-normal text-muted" title="Posted grade, none reported">
          {formatGrade(climbType, climbGrade)}
        </span>
      ) : (
        formatGrade(climbType, reportedGrade)
      )}
      {gradeFeel === "high" && <GradeArrow direction="up" label="Felt hard for the grade" />}
      {gradeFeel === "low" && <GradeArrow direction="down" label="Felt soft for the grade" />}
    </Grade>
  );
}

export function FeedClimbContext({ activity }: { activity: FeedDay["activities"][number] }) {
  return <ListRow {...climbRowProps(activity)} />;
}

export function FeedActivityOutcome({
  activity,
}: {
  activity: Pick<FeedDay["activities"][number], "kind" | "ascentStyle">;
}) {
  if (activity.kind === "training") return null;
  if (activity.kind === "send" && activity.ascentStyle)
    return <AscentStyle type={activity.ascentStyle} />;
  return (
    <Chip variant="soft" size="sm" className="bg-surface-secondary text-muted">
      {activity.kind === "repeat" ? "Repeat" : activity.kind === "session" ? "Session" : "Ascent"}
    </Chip>
  );
}

export function FeedActivityRow({
  entry: { day, activity },
  grouped = false,
  showCompanions = false,
}: {
  entry: FeedEntry;
  grouped?: boolean;
  showCompanions?: boolean;
}) {
  const section = day.journalVisible ? "journal" : "sends";
  return (
    <ListRow
      {...(grouped ? { title: day.name, href: `/users/${day.userId}` } : climbRowProps(activity))}
      wrapTitle={grouped}
      trailing={
        activity.kind !== "training" && (
          <div className="flex flex-col items-end gap-1 text-sm">
            <FeedReportedGrade activity={activity} />
            <FeedActivityOutcome activity={activity} />
          </div>
        )
      }
      actions={
        grouped && (
          <DayLink
            href={`/users/${day.userId}/${section}?date=${day.date}`}
            name={day.name}
            date={day.date}
          />
        )
      }
      tags={
        !grouped && showCompanions && !!activity.companions?.length ? (
          <CompanionList companions={activity.companions} />
        ) : undefined
      }
      comment={activity.body}
    />
  );
}
