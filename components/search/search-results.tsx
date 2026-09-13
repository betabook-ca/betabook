"use client";

import { Button } from "@heroui/react";
import { clsx } from "clsx";
import { ArrowUpRight, ChevronRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Grade } from "@/components/ui/grade";
import { InlineAlert } from "@/components/ui/inline-alert";
import { RatingStars } from "@/components/ui/rating-stars";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatCount } from "@/lib/format";
import { formatGrade } from "@/lib/grades";

import {
  SEARCH_LABELS,
  type SearchKind,
  type SearchResult,
  type SearchSection,
} from "./search-types";

export function SearchResultContent({
  item,
  selected = false,
  picking = false,
}: {
  item: SearchResult;
  selected?: boolean;
  picking?: boolean;
}) {
  return (
    <>
      {item.kind === "climber" && <UserAvatar name={item.name} image={item.image} size="sm" />}
      {item.kind === "area" && <MapPin className="size-4 shrink-0 text-muted" aria-hidden />}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium text-foreground">{item.name}</span>
        <span className="block truncate text-xs text-muted">{item.detail}</span>
        {(item.disabledReason || selected) && (
          <span className="block text-xs text-muted">{item.disabledReason ?? "Selected"}</span>
        )}
      </span>
      {item.kind === "climb" && item.discipline !== undefined && !picking && item.stats ? (
        <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
          <span className="flex items-center gap-2">
            <Grade>{formatGrade(item.discipline, item.grade)}</Grade>
            <span aria-hidden className="text-sm text-muted">
              ·
            </span>
            <RatingStars
              rating={item.stats.avgRating}
              precision="decimal"
              className="text-foreground"
            />
          </span>
          <DisciplineChip type={item.discipline} />
          <span className="text-xs text-muted">{formatCount(item.stats.sendCount, "ascent")}</span>
        </span>
      ) : (
        item.kind === "climb" &&
        item.discipline !== undefined && (
          <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            <Grade className="justify-end sm:w-14">
              {formatGrade(item.discipline, item.grade)}
            </Grade>
            <span className="flex justify-end sm:w-16">
              <DisciplineChip type={item.discipline} />
            </span>
          </span>
        )
      )}
      {!picking && <ArrowUpRight className="size-4 shrink-0 text-muted" aria-hidden />}
    </>
  );
}

export function SearchResults({
  sections,
  onSelect,
  onRetry,
  onViewCategory,
  listboxId,
  activeId,
  selectedId,
  picking = false,
  renderAction,
  resultHref,
}: {
  resultHref?: (item: SearchResult) => string | undefined;
  renderAction?: (item: SearchResult) => ReactNode;
  sections: SearchSection[];
  onSelect: (result: SearchResult) => void;
  onRetry: (kind: SearchKind) => void;
  onViewCategory?: (kind: SearchKind) => void;
  listboxId?: string;
  activeId?: string | null;
  selectedId?: string;
  picking?: boolean;
}) {
  const listed = listboxId ? sections.filter((section) => section.items.length > 0) : sections;
  return (
    <div className="flex flex-col gap-5">
      {listed.length > 0 && (
        <div
          className="flex flex-col gap-5"
          id={listboxId}
          role={listboxId ? "listbox" : undefined}
          aria-label={listboxId ? "Search results" : undefined}
        >
          {listed.map((section) => (
            <div
              key={section.kind}
              role={listboxId ? "group" : "region"}
              aria-label={section.label ?? `${SEARCH_LABELS[section.kind]} results`}
              className="min-w-0"
            >
              <div
                className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1"
                role={listboxId ? "presentation" : undefined}
              >
                {listboxId ? (
                  <span className="text-xs font-medium text-muted">
                    {SEARCH_LABELS[section.kind]}
                  </span>
                ) : (
                  <SectionHeading>{section.label ?? SEARCH_LABELS[section.kind]}</SectionHeading>
                )}
                {onViewCategory && !listboxId && (
                  <Button variant="ghost" size="sm" onPress={() => onViewCategory(section.kind)}>
                    View all {SEARCH_LABELS[section.kind].toLowerCase()}{" "}
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Button>
                )}
              </div>
              <div
                role={listboxId ? "presentation" : undefined}
                className="divide-y divide-separator"
              >
                {section.items.map((item) => {
                  const disabled = section.status !== "ready" || !!item.disabledReason;
                  const action = !disabled && renderAction?.(item);
                  const href = !picking && !disabled ? resultHref?.(item) : undefined;
                  const className = clsx(
                    "flex w-full min-w-0 items-center gap-3 px-3 py-3 text-sm transition-colors",
                    disabled ? "opacity-50" : "cursor-pointer hover:bg-surface-secondary",
                    activeId === item.id && "bg-surface-secondary",
                    selectedId === item.id && "bg-surface-secondary",
                  );
                  return listboxId ? (
                    <div
                      key={item.id}
                      id={`${listboxId}-${item.id}`}
                      role="option"
                      aria-label={`${item.name}, ${item.detail}`}
                      aria-selected={activeId === item.id}
                      aria-disabled={disabled}
                      className={className}
                      onClick={() => {
                        if (!disabled) onSelect(item);
                      }}
                    >
                      <SearchResultContent item={item} picking={picking} />
                    </div>
                  ) : (
                    <div
                      key={item.id}
                      className="flex min-w-0 flex-col sm:flex-row sm:items-center"
                    >
                      {href ? (
                        <AppLink
                          href={href}
                          aria-label={`Open ${item.name}, ${item.detail}`}
                          className={`${className} focus-visible:status-focused`}
                        >
                          <SearchResultContent item={item} />
                        </AppLink>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={`${picking ? "Choose" : "Open"} ${item.name}, ${item.detail}`}
                          aria-pressed={
                            selectedId === undefined ? undefined : selectedId === item.id
                          }
                          className={`${className} focus-visible:status-focused`}
                          onClick={() => onSelect(item)}
                        >
                          <SearchResultContent
                            item={item}
                            selected={selectedId === item.id}
                            picking={picking}
                          />
                        </button>
                      )}
                      {action && <div className="shrink-0 px-3 pb-3 sm:pb-0">{action}</div>}
                    </div>
                  );
                })}
              </div>
              {!listboxId && <ResultState section={section} onRetry={onRetry} />}
            </div>
          ))}
        </div>
      )}
      {listboxId &&
        sections.map((section) => (
          <ResultState key={section.kind} section={section} onRetry={onRetry} />
        ))}
    </div>
  );
}

function ResultState({
  section,
  onRetry,
}: {
  section: SearchSection;
  onRetry: (kind: SearchKind) => void;
}) {
  return (
    <>
      {section.status === "locked" && (
        <p className="px-3 py-4 text-sm text-muted">
          Sign in to view {SEARCH_LABELS[section.kind].toLowerCase()}.
        </p>
      )}
      {section.status === "loading" && (
        <div role="status" className="flex flex-col gap-2 p-3 text-sm text-muted">
          Searching… <span className="sr-only">{SEARCH_LABELS[section.kind]}</span>
          {section.items.length === 0 && (
            <>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </>
          )}
        </div>
      )}
      {section.status === "idle" && (
        <p className="px-3 py-6 text-sm text-muted">
          Start typing to find {SEARCH_LABELS[section.kind].toLowerCase()}.
        </p>
      )}
      {section.status === "error" && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-4">
          <InlineAlert>Couldn’t load {SEARCH_LABELS[section.kind].toLowerCase()}.</InlineAlert>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Retry ${SEARCH_LABELS[section.kind].toLowerCase()}`}
            onPress={() => onRetry(section.kind)}
          >
            Retry
          </Button>
        </div>
      )}
      {section.status === "ready" && section.items.length === 0 && (
        <EmptyState
          message={`No matching ${SEARCH_LABELS[section.kind].toLowerCase()}. Try another name or clear a filter.`}
        />
      )}
    </>
  );
}
