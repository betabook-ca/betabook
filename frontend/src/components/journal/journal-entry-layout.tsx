import { clsx } from "clsx";
import type { ReactNode } from "react";

import { ActivityIcon, type ActivityKind } from "@/components/climbing/activity-icon";
import { RowComment, RowTitleLink } from "@/components/ui/list-row";
import { rowActionsClass, RowActionsProvider, useLongPressRow } from "@/components/ui/row-actions";
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
  icon = true,
}: {
  kind: ActivityKind;
  label?: string;
  icon?: boolean;
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
      {icon && <ActivityIcon kind={kind} />}
      <span>{label}</span>
    </span>
  );
}

/** Every list of sends and journal entries prints a row the same way, reading
 * left to right, with the grade and stars at the far edge as a column:
 *
 *     [date or avatar]  Title                     grade · stars
 *                       (icon) Status · where or when         [edit]
 *                       Note
 *
 * A narrow leading column — the date, or on a climb's page the climber —
 * anchors each row while its notes use the reading column. The edit button
 * ends the short status line, so it takes no column of its own. */
export function JournalEntryLayout({
  leading,
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
  /** Replaces the date column, e.g. with the climber's avatar. */
  leading?: ReactNode;
  title: ReactNode;
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
  const longPress = useLongPressRow();

  const header = (
    <>
      <div className="flex items-start">
        <div className="flex min-w-0 flex-1 items-baseline gap-x-3">
          <div className="min-w-0 flex-1 text-base leading-6 font-bold [overflow-wrap:anywhere]">
            {href ? (
              <RowTitleLink href={href} className="leading-6 font-bold">
                {title}
              </RowTitleLink>
            ) : (
              title
            )}
          </div>
          {grade && (
            <div className="inline-flex shrink-0 items-baseline text-sm leading-6 tabular-nums">
              {grade}
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 flex min-h-6 items-center gap-1.5 text-sm text-muted">
        {status && <div className="flex shrink-0 items-center">{status}</div>}
        {status && location && <span aria-hidden>·</span>}
        {location && <div className="relative z-10 max-w-full min-w-0 truncate">{location}</div>}
        {actions && (
          // The negative margins keep the button's tap target from growing
          // the line, and line its icon up with the grade's right edge.
          <div className="relative z-10 -my-1 -mr-2 ml-auto shrink-0 pointer-coarse:-my-2.5 pointer-coarse:-mr-3.5">
            <RowActionsProvider value={longPress.context}>{actions}</RowActionsProvider>
          </div>
        )}
      </div>
    </>
  );

  const body = <EntryBody comment={comment} tags={tags} media={media} />;

  if (leading != null) {
    // A person's row: the avatar centres on the name and its status line
    // rather than on the whole row, and the note reads from the row's own
    // edge rather than indenting past the avatar.
    return (
      <article
        {...longPress.rowProps}
        className={clsx("relative isolate scroll-mt-14 py-3", rowActionsClass(true))}
      >
        <div className="flex items-center gap-3">
          <div className="relative z-10 shrink-0">{leading}</div>
          {/* Not positioned, so the name's link covers the whole row. */}
          <div className="min-w-0 flex-1">{header}</div>
        </div>
        {body}
        {longPress.anchor}
      </article>
    );
  }

  return (
    <article
      {...longPress.rowProps}
      className={clsx(
        "relative isolate scroll-mt-14 py-3",
        rowActionsClass(true),
        dateDisplay !== "grouped" &&
          "grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-4",
        dateDisplay === "continued" &&
          "before:absolute before:inset-x-0 before:top-0 before:col-start-2 before:h-px before:bg-separator",
      )}
    >
      {dateDisplay !== "grouped" && <DateColumn date={date} dateDisplay={dateDisplay} />}
      <div className="relative min-w-0">
        {header}
        {body}
      </div>
      {longPress.anchor}
    </article>
  );
}

function DateColumn({
  date,
  dateDisplay,
}: {
  date: string | null;
  dateDisplay: "full" | "day" | "continued";
}) {
  const weekday = date && formatWeekday(date);
  return (
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
  );
}

function EntryBody({
  comment,
  tags,
  media,
}: {
  comment?: string | null;
  tags?: ReactNode;
  media?: ReactNode;
}) {
  return (
    <>
      {comment && <RowComment className="mt-1.5">{comment}</RowComment>}
      {tags && (
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {tags}
        </div>
      )}
      {media && <div className="relative z-10 mt-2 flex">{media}</div>}
    </>
  );
}
