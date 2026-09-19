import { clsx } from "clsx";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";

type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  /** The title link covers the row; interactive slots sit above its overlay. */
  href?: string;
  meta?: ReactNode;
  subtitle?: ReactNode;
  tags?: ReactNode;
  /** Let tag content align with the full title column. */
  fullWidthTags?: boolean;
  trailing?: ReactNode;
  /** Separate from the trailing column's vertical stack. */
  actions?: ReactNode;
  comment?: string | null;
  /** Keep author names readable in activity rows with a fixed outcome column. */
  wrapTitle?: boolean;
  className?: string;
};

export function ListRow({
  leading,
  title,
  href,
  meta,
  subtitle,
  tags,
  fullWidthTags = false,
  trailing,
  actions,
  comment,
  wrapTitle = false,
  className,
}: ListRowProps) {
  return (
    <div
      className={clsx(
        "relative flex flex-col gap-2 px-4 py-3",
        href != null &&
          "transition-colors focus-within:bg-surface-secondary/60 hover:bg-surface-secondary/60",
        className,
      )}
    >
      {/* Header first, comment below it: the leading slot and the trailing
       * values centre on the title and subtitle alone, so an avatar sits
       * level with the name it belongs to rather than being pushed down by a
       * comment, and the comment starts at the row's own left edge instead of
       * indenting past the avatar. Same shape as JournalEntryLayout. */}
      {/* `w-full` because `className` lands on the row above and callers use
       * it to set alignment — GOAL_ROW_CLASS passes `items-start`, which on a
       * column would otherwise shrink this header to its content and collapse
       * a `fullWidthTags` slot. */}
      <div className="flex w-full items-center gap-4">
        {leading && <div className="relative z-10 shrink-0">{leading}</div>}
        {/* Keep trailing values fixed while the text column shrinks. */}
        <div className="flex min-w-0 flex-1 items-center gap-x-4">
          <div className="min-w-0 grow">
            <div className="flex items-baseline gap-2">
              <span
                className={clsx(
                  "min-w-0 flex-1 font-medium text-foreground",
                  wrapTitle ? "break-words" : "truncate",
                )}
              >
                {href != null ? (
                  <AppLink
                    href={href}
                    className={clsx(
                      "static block max-w-full",
                      wrapTitle ? "break-words" : "truncate",
                    )}
                  >
                    {/* `static` makes the overlay position against the row. */}
                    <span aria-hidden className="absolute inset-0" />
                    {title}
                  </AppLink>
                ) : (
                  title
                )}
              </span>
              {meta && <span className="shrink-0 text-sm text-muted">{meta}</span>}
            </div>
            {/* Bound fit-content so long subtitles truncate within the column. */}
            {subtitle && (
              <div className="relative z-10 w-fit max-w-full truncate text-sm text-muted">
                {subtitle}
              </div>
            )}
            {tags && (
              <div
                className={clsx(
                  "relative z-10 mt-1 flex flex-wrap gap-2",
                  fullWidthTags ? "w-full" : "w-fit",
                )}
              >
                {tags}
              </div>
            )}
          </div>
          {trailing && <div className="shrink-0 text-right tabular-nums">{trailing}</div>}
        </div>
        {actions && <div className="relative z-10 shrink-0">{actions}</div>}
      </div>
      {comment != null && (
        // Keep text selection above the row-link overlay.
        <div className="relative z-10 text-sm leading-relaxed text-foreground">
          <ClampedComment>{comment}</ClampedComment>
        </div>
      )}
    </div>
  );
}
