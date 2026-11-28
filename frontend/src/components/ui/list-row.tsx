import { clsx } from "clsx";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { rowActionsClass, RowActionsProvider, useLongPressRow } from "@/components/ui/row-actions";

/** A row's title link. Its overlay covers the row, so the whole row is one
 * target; the row's other interactive slots sit above it at z-10. The row
 * itself must be positioned and the link left `static`. */
export function RowTitleLink({
  href,
  className,
  "aria-label": ariaLabel,
  children,
}: {
  href: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  return (
    <AppLink href={href} aria-label={ariaLabel} className={clsx("static block", className)}>
      <span aria-hidden className="absolute inset-0" />
      {children}
    </AppLink>
  );
}

/** A row's note, in the reading column, clamped with a "more" toggle. Raised
 * above the title link's overlay so its text stays selectable. */
export function RowComment({
  children,
  className,
  expandLabel,
  collapseLabel,
  fullWidth = false,
}: {
  children: string;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
  /** Spans its container instead of the reading measure, for a note inside a
   * card that already sets its width (a feed card). */
  fullWidth?: boolean;
}) {
  return (
    <div
      className={clsx(
        "relative z-10 text-sm leading-[1.5] [overflow-wrap:anywhere] text-foreground",
        !fullWidth && "max-w-prose",
        className,
      )}
    >
      <ClampedComment expandLabel={expandLabel} collapseLabel={collapseLabel}>
        {children}
      </ClampedComment>
    </div>
  );
}

type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  /** The title link covers the row; interactive slots sit above its overlay. */
  href?: string;
  linkLabel?: string;
  meta?: ReactNode;
  subtitle?: ReactNode;
  tags?: ReactNode;
  /** Let tag content align with the full title column. */
  fullWidthTags?: boolean;
  trailing?: ReactNode;
  /** Separate from the trailing column's vertical stack. */
  actions?: ReactNode;
  comment?: string | null;
  /** Below the comment, at the row's full width — a send's video control. */
  media?: ReactNode;
  /** Keep author names readable in activity rows with a fixed outcome column. */
  wrapTitle?: boolean;
  /** `li` inside a `<ul role="list">` so assistive tech gets item count and
   * position. The role is explicit because preflight's list-style:none makes
   * Safari drop list semantics. */
  as?: "div" | "li";
  /** `flush` drops the side padding and tightens the rows, for a list that
   * already sits inside a padded section, such as the goals list. */
  density?: "default" | "flush";
  className?: string;
};

export function ListRow({
  leading,
  title,
  href,
  linkLabel,
  meta,
  subtitle,
  tags,
  fullWidthTags = false,
  trailing,
  actions,
  comment,
  media,
  wrapTitle = false,
  as: Tag = "div",
  density = "default",
  className,
}: ListRowProps) {
  const longPress = useLongPressRow();
  return (
    <Tag
      {...longPress.rowProps}
      className={clsx(
        "relative flex flex-col gap-2",
        rowActionsClass(density === "flush"),
        density === "flush" ? "px-0 py-2.5" : "px-4 py-3",
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
       * it to set alignment — the goals list passes `items-start`, which on a
       * column would otherwise shrink this header to its content and collapse
       * a `fullWidthTags` slot. */}
      <div className="flex w-full items-center gap-4">
        {leading && <div className="relative z-10 shrink-0">{leading}</div>}
        {/* Keep trailing values fixed while the text column shrinks. */}
        <div className="flex min-w-0 flex-1 items-center gap-x-4">
          <div className="min-w-0 grow">
            <div className="flex items-baseline gap-2">
              <div
                className={clsx(
                  "min-w-0 flex-1 font-medium text-foreground",
                  wrapTitle ? "break-words" : "truncate",
                )}
              >
                {href != null ? (
                  <RowTitleLink
                    href={href}
                    aria-label={linkLabel}
                    className={clsx("max-w-full", wrapTitle ? "break-words" : "truncate")}
                  >
                    {title}
                  </RowTitleLink>
                ) : (
                  title
                )}
              </div>
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
        {actions && (
          <div className="relative z-10 shrink-0">
            <RowActionsProvider value={longPress.context}>{actions}</RowActionsProvider>
          </div>
        )}
      </div>
      {comment != null && <RowComment>{comment}</RowComment>}
      {media && <div className="relative z-10 flex">{media}</div>}
      {longPress.anchor}
    </Tag>
  );
}
