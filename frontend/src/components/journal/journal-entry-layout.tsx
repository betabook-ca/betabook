import { clsx } from "clsx";
import type { ReactNode } from "react";

import { ActivityIcon, type ActivityKind } from "@/components/ui/activity-icon";
import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { formatDate, formatMonth, formatWeekday } from "@/lib/format-date";

const STATUS_LABELS: Record<ActivityKind, string> = {
  send: "Sent",
  repeat: "Repeat",
  session: "Session",
  training: "Training",
};

export function JournalEntryStatus({
  kind,
  label = STATUS_LABELS[kind],
}: {
  kind: ActivityKind;
  label?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1",
        kind === "send"
          ? "font-medium text-success-soft-foreground"
          : kind === "repeat"
            ? "text-muted"
            : "text-foreground",
      )}
    >
      <ActivityIcon kind={kind} />
      <span>{label}</span>
    </span>
  );
}

/** A narrow date column anchors each entry while its notes use the reading column. */
export function JournalEntryLayout({
  title,
  href,
  location,
  grade,
  status,
  date,
  dateDisplay = "full",
  tags,
  comment,
  media,
  actions,
}: {
  title: string;
  href?: string;
  location?: ReactNode;
  grade?: ReactNode;
  status?: ReactNode;
  date: string | null;
  dateDisplay?: "full" | "day" | "continued" | "grouped";
  tags?: ReactNode;
  comment?: string | null;
  /** Below the comment — a send's video control. */
  media?: ReactNode;
  actions?: ReactNode;
}) {
  const weekday = date && formatWeekday(date);
  return (
    <article
      className={clsx(
        "relative isolate scroll-mt-14 py-3",
        dateDisplay !== "grouped" &&
          "grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-4",
        dateDisplay === "continued" &&
          "before:absolute before:inset-x-0 before:top-0 before:col-start-2 before:h-px before:bg-separator",
      )}
    >
      {dateDisplay !== "grouped" && (
        <div>
          {date && weekday ? (
            <time dateTime={date} className="flex flex-col text-date-ink">
              <span className="sr-only">{formatDate(date)}</span>
              <span
                aria-hidden
                className={clsx(
                  "font-display text-2xl leading-6 font-normal tabular-nums",
                  dateDisplay === "continued" && "invisible",
                )}
              >
                {Number(date.slice(-2))}
              </span>
              <span
                aria-hidden
                className={clsx(
                  "mt-1 flex min-h-6 items-center text-xs font-medium uppercase",
                  dateDisplay === "continued" && "invisible",
                )}
              >
                {dateDisplay === "full" ? formatMonth(date.slice(0, 7)) : weekday}
              </span>
            </time>
          ) : (
            <span className="text-xs text-muted">{date || "Date unknown"}</span>
          )}
        </div>
      )}
      <div className="relative min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <div className="max-w-full min-w-0 text-base leading-6 font-bold [overflow-wrap:anywhere]">
              {href ? (
                <AppLink href={href} className="static block leading-6 font-bold">
                  <span aria-hidden className="absolute inset-0" />
                  {title}
                </AppLink>
              ) : (
                title
              )}
            </div>
            {grade && (
              <div className="inline-flex items-baseline text-sm leading-6 tabular-nums">
                {grade}
              </div>
            )}
          </div>
          {actions && <div className="relative z-10 -my-2.5 shrink-0">{actions}</div>}
        </div>
        <div className="mt-1 flex min-h-6 items-center gap-2 text-sm text-muted">
          {status && <div className="flex min-w-20 shrink-0 items-center">{status}</div>}
          {location && <div className="relative z-10 max-w-full min-w-0 truncate">{location}</div>}
        </div>
        {comment && (
          <div className="relative z-10 mt-1.5 max-w-prose text-sm leading-[1.5] [overflow-wrap:anywhere]">
            <ClampedComment>{comment}</ClampedComment>
          </div>
        )}
        {tags && (
          <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {tags}
          </div>
        )}
        {media && <div className="relative z-10 mt-2 flex">{media}</div>}
      </div>
    </article>
  );
}
