import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";

/** One item on an index of the climber's own collections (trips, climb
 * lists): a linked title with an optional badge beside it, a muted summary
 * line, its actions menu at the top right, then a two-line description and
 * any details. Render inside a `ul` with `gap-3`. */
export function IndexCard({
  title,
  href,
  badge,
  summary,
  actions,
  description,
  children,
}: {
  title: string;
  href: string;
  badge?: ReactNode;
  summary: ReactNode;
  actions?: ReactNode;
  description?: string | null;
  children?: ReactNode;
}) {
  const link = (
    <AppLink href={href} className="font-medium">
      {title}
    </AppLink>
  );
  return (
    <li className={`flex flex-col gap-3 ${cardClass("sm", "bordered")}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {badge ? (
            <div className="flex flex-wrap items-center gap-2">
              {link}
              {badge}
            </div>
          ) : (
            link
          )}
          <p className="text-sm text-muted">{summary}</p>
        </div>
        {actions}
      </div>
      {description && <p className="line-clamp-2 text-sm leading-relaxed">{description}</p>}
      {children}
    </li>
  );
}
