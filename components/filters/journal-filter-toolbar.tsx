"use client";

import { dateActiveFilters, hashtagActiveFilters } from "@/components/filters/active-filter-values";
import { DateFilter } from "@/components/filters/date-filter";
import { FilterInput } from "@/components/filters/filter-input";
import { FilterToolbarLayout } from "@/components/filters/filter-toolbar";
import { FriendFilter } from "@/components/filters/friend-filter";
import { HashtagFilter } from "@/components/filters/hashtag-filter";
import { AppLink } from "@/components/ui/app-link";
import { choicePillClass } from "@/components/ui/choice-pill";
import { FIELD_WIDTH_CLASS, FILTER_PILL_CLASS } from "@/components/ui/field";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import {
  DEFAULT_JOURNAL_FILTER,
  JOURNAL_VIEWS,
  MAX_JOURNAL_QUERY_LENGTH,
  journalFilterToSearchParams,
  type JournalFilter,
  type JournalView,
} from "@/lib/filters/journal-filter";
import type { CompanionOption } from "@/lib/journal-companions";

const NO_FRIENDS: CompanionOption[] = [];

const VIEW_LABELS: Record<JournalView, string> = {
  all: "All",
  sessions: "Sessions",
  training: "Training",
};

function href(base: string, filter: JournalFilter): string {
  const params = journalFilterToSearchParams(filter);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Year and climb filters have no control here; their active-filter chips are the only way to clear them. */
export function JournalFilterToolbar({
  userId,
  filter,
  climbName,
  tags,
  isOwner = false,
  friends = NO_FRIENDS,
}: {
  userId: string;
  filter: JournalFilter;
  climbName: string | null;
  tags: string[];
  isOwner?: boolean;
  friends?: CompanionOption[];
}) {
  const base = `/users/${userId}/journal`;
  const {
    filter: localFilter,
    setFilter,
    reset,
  } = useFilterFormNavigation({
    initialFilter: filter,
    defaultFilter: DEFAULT_JOURNAL_FILTER,
    buildHref: (value) => href(base, { ...value, query: value.query?.trim() || null }),
  });

  return (
    <FilterToolbarLayout
      onReset={reset}
      activeFilters={[
        ...(isOwner
          ? localFilter.friendIds.map((id) => ({
              id: `friend-${id}`,
              label: `With: ${friends.find((friend) => friend.id === id)?.name ?? "Selected friend"}`,
              onRemove: () =>
                setFilter({
                  ...localFilter,
                  friendIds: localFilter.friendIds.filter((value) => value !== id),
                }),
            }))
          : []),
        ...dateActiveFilters(localFilter, setFilter),
        ...hashtagActiveFilters(localFilter.tags, (tags) => setFilter({ ...localFilter, tags })),
        ...(localFilter.query
          ? [
              {
                id: "query",
                label: `Text: ${localFilter.query}`,
                onRemove: () => setFilter({ ...localFilter, query: null }),
              },
            ]
          : []),
        ...(localFilter.view !== "all"
          ? [
              {
                id: "view",
                label: VIEW_LABELS[localFilter.view],
                onRemove: () => setFilter({ ...localFilter, view: "all" }),
              },
            ]
          : []),
        ...(localFilter.year !== null
          ? [
              {
                id: "year",
                label: `Year: ${localFilter.year}`,
                onRemove: () => setFilter({ ...localFilter, year: null }),
              },
            ]
          : []),
        ...(localFilter.climbId !== null
          ? [
              {
                id: "climb",
                label: `Climb: ${climbName || "Selected climb"}`,
                onRemove: () => setFilter({ ...localFilter, climbId: null }),
              },
            ]
          : []),
      ]}
      filters={
        <>
          <DateFilter
            value={localFilter}
            onChange={(dates) => setFilter({ ...localFilter, ...dates, year: null })}
          />
          {isOwner && (
            <FriendFilter
              value={localFilter.friendIds}
              friends={friends}
              onChange={(friendIds) => setFilter({ ...localFilter, friendIds })}
            />
          )}
          <HashtagFilter
            inlineLabel
            value={localFilter.tags}
            tags={tags}
            onChange={(tags) => setFilter({ ...localFilter, tags })}
          />
        </>
      }
      search={
        <div className={FIELD_WIDTH_CLASS.long}>
          <FilterInput
            label="Filter journal"
            value={localFilter.query ?? ""}
            onChange={(query) => setFilter({ ...localFilter, query: query.trim() ? query : null })}
            placeholder="Filter journal…"
            inputProps={{ maxLength: MAX_JOURNAL_QUERY_LENGTH }}
          />
        </div>
      }
      controls={
        <div className="flex gap-1.5">
          {JOURNAL_VIEWS.map((view) => (
            <AppLink
              key={view}
              href={href(base, { ...localFilter, view })}
              aria-current={filter.view === view ? "page" : undefined}
              className={`${choicePillClass(filter.view === view, "bg-foreground text-background")} ${FILTER_PILL_CLASS}`}
            >
              {VIEW_LABELS[view]}
            </AppLink>
          ))}
        </div>
      }
    />
  );
}
