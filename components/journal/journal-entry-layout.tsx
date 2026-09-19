import { clsx } from "clsx";
import type { ReactNode } from "react";

import { ActivityIcon, type ActivityKind } from "@/components/ui/activity-icon";
import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { formatDate } from "@/lib/format-date";

const STATUS_LABELS: Record<ActivityKind, string> = {
  send: "Sent",
  repeat: "Repeat",
  session: "Session",
  training: "Training",
};

export function JournalEntryStatus({ kind }: { kind: ActivityKind }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1",
        kind === "send"
          ? "font-medium text-accent-soft-foreground"
          : kind === "repeat"
            ? "text-muted"
            : "text-foreground",
      )}
    >
      <ActivityIcon kind={kind} />
      <span>{STATUS_LABELS[kind]}</span>
    </span>
  );
}

/** Shared Journal/Sends row: prose stays beside the grade, status, date, and actions. */
export function JournalEntryLayout({
  title,
  href,
  location,
  grade,
  status,
  date,
  tags,
  comment,
  actions,
}: {
  title: string;
  href?: string;
  location?: ReactNode;
  grade?: ReactNode;
  status?: ReactNode;
  date: string | null;
  tags?: ReactNode;
  comment?: string | null;
  actions?: ReactNode;
}) {
  return (
    <article
      className={clsx(
        "relative px-4 py-3.5",
        href &&
          "transition-colors focus-within:bg-surface-secondary/60 hover:bg-surface-secondary/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-base leading-6 font-medium break-words">
            {href ? (
              <AppLink href={href} className="static block">
                <span aria-hidden className="absolute inset-0" />
                {title}
              </AppLink>
            ) : (
              title
            )}
          </div>
          {location && (
            <div className="relative z-10 w-fit max-w-full truncate text-sm text-muted">
              {location}
            </div>
          )}
          {tags && (
            <div className="relative z-10 mt-1.5 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {tags}
            </div>
          )}
          {comment && (
            <div
              className={clsx(
                "relative z-10 max-w-[65ch] text-sm leading-relaxed text-foreground",
                tags ? "mt-0.5" : location ? "mt-2.5" : "mt-1.5",
              )}
            >
              <ClampedComment>{comment}</ClampedComment>
            </div>
          )}
        </div>
        <div className="relative z-10 flex shrink-0 flex-col items-end text-right text-sm tabular-nums">
          <div className="flex h-[26px] items-center justify-end">
            {grade ?? <span className="text-muted">—</span>}
          </div>
          <div className="flex h-[26px] items-center justify-end">
            {status ?? <span className="text-muted">—</span>}
          </div>
          <div className="flex h-[26px] items-center justify-end text-xs text-muted">
            {date ? <time dateTime={date}>{formatDate(date)}</time> : "Date unknown"}
          </div>
        </div>
        {actions && <div className="relative z-10 -my-2.5 shrink-0">{actions}</div>}
      </div>
    </article>
  );
}
