"use client";

import { clsx } from "clsx";
import { Check, ChevronRight, CircleDashed, Dumbbell, Repeat2 } from "lucide-react";
import { useId, useState } from "react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { CompanionList } from "@/components/journal/companion-list";
import { GradeFeelArrow } from "@/components/send-grade-cell";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { Grade } from "@/components/ui/grade";
import { UserAvatar } from "@/components/ui/user-avatar";
import { feedDayHref, type FeedView } from "@/lib/feed";
import type { FeedEntry } from "@/lib/feed-groups";
import { formatDate } from "@/lib/format-date";
import { formatActivityGrade } from "@/lib/grades";
import { climbHref } from "@/lib/slug";

type Activity = FeedEntry["activity"];

function outcome(activity: Activity) {
  if (activity.kind === "send")
    return {
      Icon: Check,
      sent: true,
      label: `Send${activity.ascentStyle ? ` · ${ASCENT_STYLE_LABELS[activity.ascentStyle]}` : ""}`,
    };
  if (activity.kind === "repeat") return { Icon: Repeat2, label: "Repeat", sent: false };
  if (activity.kind === "training") return { Icon: Dumbbell, label: "Training", sent: false };
  return { Icon: CircleDashed, label: "Session", sent: false };
}

/** One climb (or connected training group); source entries retain their own author and outcome. */
export function FeedActivityCard({
  entries,
  view,
  links = true,
}: {
  entries: FeedEntry[];
  view: FeedView;
  /** Tutorials reuse the real display without sending sample IDs to app destinations. */
  links?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  const first = entries[0];
  if (!first) return null;
  const { activity } = first;
  const title = activity.climbName ?? "Training";
  const hiddenSummary = (["send", "session", "repeat", "training"] as const)
    .map((kind) => {
      const count = entries.slice(2).filter((entry) => entry.activity.kind === kind).length;
      return count
        ? `${count} ${kind === "training" ? "training update" : kind}${count === 1 ? "" : "s"}`
        : null;
    })
    .filter(Boolean)
    .join(" · ");
  const row = ({ day, activity: item }: FeedEntry) => {
    const { Icon, label, sent } = outcome(item);
    const grade = formatActivityGrade(
      item.climbType,
      item.climbGrade,
      item.kind === "send" || item.kind === "repeat",
      item.reportedGrade,
    );
    return (
      <div key={`${day.userId}:${item.kind}:${item.id}`} className="flex gap-3 py-3">
        <span
          className={clsx(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
            sent
              ? "bg-success-soft text-accent-soft-foreground"
              : "bg-surface-secondary text-muted",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex min-h-8 min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
              <div className="flex min-w-0 items-center gap-2">
                <UserAvatar name={day.name} image={day.image} size="xs" />
                {links ? (
                  <AppLink
                    href={`/users/${day.userId}`}
                    className="text-sm font-medium break-words text-foreground"
                  >
                    {day.name}
                  </AppLink>
                ) : (
                  <span className="text-sm font-medium break-words">{day.name}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className={clsx(
                    "text-sm font-medium whitespace-nowrap",
                    sent ? "text-accent-soft-foreground" : "text-muted",
                  )}
                >
                  {label}
                </span>
                {grade && (
                  <Grade className="whitespace-nowrap">
                    <span title={item.reportedGrade != null ? "Climber's grade" : "Posted grade"}>
                      {grade}
                    </span>
                    {(item.kind === "send" || item.kind === "repeat") && item.gradeFeel && (
                      <GradeFeelArrow gradeFeel={item.gradeFeel} />
                    )}
                  </Grade>
                )}
              </div>
            </div>
            {links && (
              <AppLink
                href={feedDayHref(day, view)}
                prefetch={false}
                aria-label={`View activity for ${day.name} on ${formatDate(day.date)}`}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-xs text-muted sm:pointer-fine:min-h-8"
              >
                <span className="hidden sm:inline">View day</span>
                <ChevronRight aria-hidden className="size-4" />
              </AppLink>
            )}
          </div>
          {entries.length === 1 && view === "all" && !!item.companions?.length && (
            <CompanionList companions={item.companions} profileLinks={links} />
          )}
          {item.body && (
            <div className="mt-1 text-sm leading-relaxed text-foreground">
              <ClampedComment expandLabel="Read more" collapseLabel="Read less">
                {item.body}
              </ClampedComment>
            </div>
          )}
        </div>
      </div>
    );
  };
  return (
    <article aria-label={title} className={cardClass("none", "bordered")}>
      <header className="px-4 pt-3 pb-2">
        <h3 className="text-base font-medium break-words">
          {links && activity.climbId != null && activity.climbName ? (
            <AppLink className="inline" href={climbHref(activity.climbId, activity.climbName)}>
              {title}
            </AppLink>
          ) : (
            title
          )}
        </h3>
        {activity.areaId != null &&
          activity.areaName &&
          (links ? (
            <AreaBreadcrumb
              areaId={activity.areaId}
              areaName={activity.areaName}
              ancestors={activity.areaAncestors ?? []}
            />
          ) : (
            <span className="text-xs text-muted">{activity.areaName}</span>
          ))}
      </header>
      <div className="mx-4 divide-y divide-separator border-t border-separator">
        {entries.slice(0, 2).map(row)}
        {entries.length > 2 && (
          <div>
            <div id={moreId} hidden={!expanded} className="divide-y divide-separator">
              {entries.slice(2).map(row)}
            </div>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={moreId}
              onClick={() => setExpanded((previous) => !previous)}
              className={clsx(
                "block w-full cursor-pointer py-3 text-left text-sm font-medium text-link focus-visible:status-focused",
                expanded && "border-t border-separator",
              )}
            >
              {expanded ? "Show less activity" : `Show more: ${hiddenSummary}`}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
