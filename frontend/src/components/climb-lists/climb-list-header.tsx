import type { ReactNode } from "react";

import { BackLink } from "@/components/ui/back-link";
import { SectionHeading } from "@/components/ui/typography";
import type { ClimbListSummary } from "@/lib/catalog-types";
import { climbCountLabel } from "@/lib/climb-lists";

/** A list's name, description and climb count, above its climbs. Uses
 * SectionHeading, not PageTitle: the profile layout already has the h1. */
export function ClimbListHeader({
  list,
  back,
  byline,
  actions,
}: {
  list: Pick<ClimbListSummary, "title" | "description" | "climbCount">;
  /** Where "All lists" goes. Omitted on a shared page. */
  back?: string;
  /** Who made it, for readers other than the owner. */
  byline?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && <BackLink href={back}>All lists</BackLink>}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionHeading className="min-w-0 break-words">{list.title}</SectionHeading>
          <p className="text-sm text-muted">
            {climbCountLabel(list.climbCount)}
            {byline && <> · {byline}</>}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {list.description && (
        <p className="max-w-[65ch] text-sm leading-relaxed whitespace-pre-line">
          {list.description}
        </p>
      )}
    </header>
  );
}
