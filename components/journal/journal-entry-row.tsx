"use client";

import { clsx } from "clsx";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { EntryActionsMenu } from "@/components/journal/entry-actions-menu";
import { JournalCompanions } from "@/components/journal/journal-companions";
import { JournalEntryLayout, JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { AppLink } from "@/components/ui/app-link";
import { Grade } from "@/components/ui/grade";
import type { AreaBreadcrumbs, JournalEntry } from "@/db/queries";
import { journalFilterToSearchParams, type JournalFilter } from "@/lib/filters/journal-filter";
import { formatActivityGrade } from "@/lib/grades";
import { climbHref } from "@/lib/slug";

function tagHref(userId: string, filter: JournalFilter, tag: string): string {
  const params = journalFilterToSearchParams({
    ...filter,
    tags: filter.tags.includes(tag)
      ? filter.tags.filter((value) => value !== tag)
      : [...filter.tags, tag],
  });
  const query = params.toString();
  const base = `/users/${userId}/journal`;
  return query ? `${base}?${query}` : base;
}

export function JournalEntryRow({
  entry,
  isOwner,
  userId,
  filter,
  areaBreadcrumbs,
}: {
  entry: JournalEntry;
  isOwner: boolean;
  userId: string;
  filter: JournalFilter;
  areaBreadcrumbs: AreaBreadcrumbs;
}) {
  const grade = formatActivityGrade(
    entry.climbType,
    entry.climbGrade,
    entry.sent,
    entry.reportedGrade,
  );
  const status =
    entry.kind === "training" && !entry.isAscent ? (
      "Training"
    ) : (
      <JournalEntryStatus isAscent={entry.isAscent} sent={entry.sent} />
    );
  const tags =
    entry.tags.length > 0 || (entry.companions?.length ?? 0) > 0 ? (
      <>
        <JournalCompanions entryId={entry.id} initialCompanions={entry.companions} />
        {entry.tags.map((tag) => {
          const active = filter.tags.includes(tag);
          return (
            <AppLink
              key={tag}
              href={tagHref(userId, filter, tag)}
              aria-current={active ? "page" : undefined}
              aria-label={active ? `Clear ${tag} filter` : `Filter journal by ${tag}`}
              className={clsx(
                "text-xs no-underline transition-colors hover:text-foreground",
                active ? "font-medium text-foreground underline underline-offset-4" : "text-muted",
              )}
            >
              #{tag}
            </AppLink>
          );
        })}
      </>
    ) : undefined;
  const actions = isOwner ? <EntryActionsMenu entry={entry} /> : undefined;

  if (
    entry.climbId != null &&
    entry.climbName != null &&
    entry.climbType != null &&
    entry.areaId != null &&
    entry.areaName != null
  ) {
    return (
      <JournalEntryLayout
        title={entry.climbName}
        href={climbHref(entry.climbId, entry.climbName)}
        location={
          <AreaBreadcrumb
            areaId={entry.areaId}
            areaName={entry.areaName}
            ancestors={areaBreadcrumbs[entry.areaId] ?? []}
          />
        }
        grade={
          grade ? (
            <Grade>
              <span title={entry.reportedGrade != null ? "Climber's grade" : "Posted grade"}>
                {grade}
              </span>
            </Grade>
          ) : undefined
        }
        status={status}
        date={entry.entryDate}
        tags={tags}
        comment={entry.body}
        actions={actions}
      />
    );
  }

  return (
    <JournalEntryLayout
      title={entry.climbName ?? (entry.kind === "training" ? "Training" : "Unknown climb")}
      tags={tags}
      status={status}
      date={entry.entryDate}
      comment={entry.body}
      actions={actions}
    />
  );
}
