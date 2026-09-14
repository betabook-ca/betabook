import { clsx } from "clsx";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";

type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  /** When set, `title` is wrapped in a link to `href` and the whole row
   * becomes its click target: an invisible overlay inside the link
   * stretches across the row (the row is the positioned ancestor), and the
   * row gets hover/focus-within feedback. Slots that hold their own
   * links/buttons (leading, subtitle, tags, actions) sit above the overlay
   * via z-index so they stay independently clickable. Rows without an
   * `href` get neither the overlay nor the hover affordance. */
  href?: string;
  meta?: ReactNode;
  subtitle?: ReactNode;
  tags?: ReactNode;
  /** Let tag content align with the full title column. */
  fullWidthTags?: boolean;
  trailing?: ReactNode;
  /** Rendered to the right of `trailing`, e.g. a "..." actions menu —
   * separate from `trailing` so it never gets pulled into that column's
   * own vertical stack. */
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
        // Guidebook route-table density: rows are separated by the list's
        // divide-y hairlines, so no rounding — px keeps the tap target
        // breathing while py-3 tightens the table.
        "relative flex items-center gap-4 px-4 py-3",
        href != null &&
          "transition-colors focus-within:bg-surface-secondary/60 hover:bg-surface-secondary/60",
        className,
      )}
    >
      {leading && <div className="relative z-10 shrink-0">{leading}</div>}
      {/* Text column + trailing block stay on one line at every width. These
       * used to be a wrapping pair, which on a phone dropped the trailing
       * block onto its own line below the title — the row read as two
       * stacked half-rows rather than one guidebook table row, and the
       * centered leading slot floated in the middle of the extra height.
       * The trailing block is the fixed-width side (it holds short, known
       * values: a grade, a rating, a date), so the text column is the one
       * that gives — title and subtitle truncate into whatever is left. */}
      <div className="flex min-w-0 flex-1 items-center gap-x-4">
        <div className="flex min-w-0 grow flex-col gap-2">
          <div>
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
                    {/* Stretches this link's click target across the whole
                     * row — `static` undoes the link's own `relative` so
                     * inset-0 resolves against the row instead. */}
                    <span aria-hidden className="absolute inset-0" />
                    {title}
                  </AppLink>
                ) : (
                  title
                )}
              </span>
              {meta && <span className="shrink-0 text-sm text-muted">{meta}</span>}
            </div>
            {/* max-w-full pairs with w-fit so the truncate has a ceiling to
             * clip against: fit-content on its own resolves to the full
             * (now nowrap) text width and would overflow the column. */}
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
          {comment != null && (
            // Lifted above the row-link overlay like the other slots so the
            // comment text stays selectable instead of click-navigating with
            // the row.
            <div className="relative z-10 text-sm leading-relaxed text-foreground">
              <ClampedComment>{comment}</ClampedComment>
            </div>
          )}
        </div>
        {/* No ml-auto: the text column grows, so this already sits hard
         * right — and it must never shrink, or the values it holds wrap. */}
        {trailing && <div className="shrink-0 text-right tabular-nums">{trailing}</div>}
      </div>
      {actions && <div className="relative z-10 shrink-0">{actions}</div>}
    </div>
  );
}
