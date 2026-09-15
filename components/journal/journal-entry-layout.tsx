import { clsx } from "clsx";
import { CircleCheckBig } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { formatDate } from "@/lib/format-date";

/** Climbing status; training entries omit the status slot entirely. */
export function JournalEntryStatus({ isAscent, sent }: { isAscent: boolean; sent: boolean }) {
  if (isAscent)
    return (
      <span className="inline-flex items-center gap-1 font-medium text-success-soft-foreground">
        <CircleCheckBig aria-hidden className="size-4" />
        <span>Sent</span>
      </span>
    );
  return <span>{sent ? "Repeat" : "Session"}</span>;
}

/** Journal prose sits below the entry header, so notes never displace its grade or actions. */
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
  date: string;
  tags?: ReactNode;
  comment?: string | null;
  actions?: ReactNode;
}) {
  return (
    <article
      className={clsx(
        "relative px-4 py-4",
        href &&
          "transition-colors focus-within:bg-surface-secondary/60 hover:bg-surface-secondary/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
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
            {grade && <div className="flex h-6 shrink-0 items-center tabular-nums">{grade}</div>}
          </div>
          {location && (
            <div className="relative z-10 mt-1 w-fit max-w-full truncate text-sm text-muted">
              {location}
            </div>
          )}
        </div>
        {actions && <div className="relative z-10 -my-2.5 shrink-0">{actions}</div>}
      </div>
      <div className="relative z-10 mt-1 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <time dateTime={date}>{formatDate(date)}</time>
        {status && (
          <>
            <span aria-hidden>·</span>
            {status}
          </>
        )}
      </div>
      {tags && (
        <div className="relative z-10 mt-1 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {tags}
        </div>
      )}
      {comment && (
        <div className="relative z-10 mt-2 max-w-[65ch] text-sm leading-relaxed text-foreground">
          <ClampedComment>{comment}</ClampedComment>
        </div>
      )}
    </article>
  );
}
