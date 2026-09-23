"use client";
import { Button, Kbd, Modal } from "@heroui/react";
import { clsx } from "clsx";
import { ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { useCompactViewport } from "@/hooks/use-compact-viewport";
import type { AreaSelection } from "@/lib/area-selection";

import { SearchCategories } from "./search-categories";
import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import type { SearchCategory, SearchKind, SearchResult, SearchSection } from "./search-types";

type SearchSurfaceProps = {
  query: string;
  onQueryChange: (query: string) => void;
  category: SearchCategory;
  onCategoryChange: (category: SearchCategory) => void;
  sections: SearchSection[];
  suggestions?: SearchSection;
  onSelect: (item: SearchResult) => void;
  onRetry: (kind: SearchKind) => void;
  onViewAll: () => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  loadMoreFailed?: boolean;
  area?: AreaSelection | null;
  filters?: ReactNode;
  memberNotice?: ReactNode;
  /** The full page leads with the notice; the palette and landing keep it by the results. */
  memberNoticePlacement?: "results" | "top";
  canCreate?: boolean;
  renderAction?: (item: SearchResult) => ReactNode;
  resultHref?: (item: SearchResult) => string | undefined;
};

const SEARCH_PLACEHOLDERS: Record<SearchCategory, string> = {
  all: "Search climbs, areas, and climbers…",
  climb: "Search climbs…",
  area: "Search areas…",
  climber: "Search climbers…",
};

export function SearchSurface({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  sections,
  suggestions,
  onSelect,
  onRetry,
  onViewAll,
  onLoadMore,
  loadingMore = false,
  loadMoreFailed = false,
  area,
  filters,
  memberNotice,
  memberNoticePlacement = "results",
  canCreate,
  renderAction,
  resultHref,
  quick = false,
  onClose,
  headerAction,
  compact = false,
}: SearchSurfaceProps & {
  quick?: boolean;
  onClose?: () => void;
  /** Rendered on the input's row. The quick dialog puts its Cancel here
   * when the viewport is too short to afford a separate header row. */
  headerAction?: ReactNode;
  /** Collapses the filters above the result list. The quick dialog measures
   * the viewport and sets this; the full search page scrolls, so it never
   * needs it. */
  compact?: boolean;
}) {
  const { rootRef, listId, activeId, onKeyDown } = useQuickSearchNavigation({
    query,
    category,
    area,
    sections,
    quick,
    onClose,
    onSelect,
    onViewAll,
  });
  const hasResults = sections.some((section) => section.items.length > 0);
  const idle = sections.every(
    (section) => section.status === "idle" || section.status === "locked",
  );
  const visibleSections = sections.filter(
    (section) =>
      section.items.length > 0 || section.status === "loading" || section.status === "error",
  );
  return (
    <div
      ref={rootRef}
      className={clsx(
        "flex min-h-0 min-w-0 flex-col",
        compact ? "gap-2" : "gap-4",
        quick && "flex-1",
      )}
    >
      <MemberNoticeSlot
        notice={memberNotice}
        placement={memberNoticePlacement}
        at="top"
        className="shrink-0"
      />
      {/* The page picks what to search before typing; the palette types first
       * so an early ⌘K lands in a focused field. */}
      {!quick && <SearchCategories value={category} onChange={onCategoryChange} />}
      <SearchQueryRow
        query={query}
        onQueryChange={onQueryChange}
        category={category}
        quick={quick}
        headerAction={headerAction}
        onKeyDown={onKeyDown}
        listId={listId}
        activeId={activeId}
        expanded={!idle && hasResults}
      />
      <SearchFilterRow
        category={category}
        quick={quick}
        compact={compact}
        onCategoryChange={onCategoryChange}
      />
      {filters}
      <div
        className="min-h-0 overflow-y-auto focus-visible:status-focused"
        tabIndex={quick ? 0 : undefined}
        role={quick ? "region" : undefined}
        aria-label={quick ? "Scrollable search results" : undefined}
        aria-busy={sections.some((section) => section.status === "loading")}
      >
        <MemberNoticeSlot
          notice={memberNotice}
          placement={memberNoticePlacement}
          at="results"
          className="mb-4"
        />
        {idle ? (
          <IdleResults
            suggestions={suggestions}
            onSelect={onSelect}
            onRetry={onRetry}
            renderAction={renderAction}
            resultHref={resultHref}
          />
        ) : (
          <SearchResults
            sections={visibleSections}
            onSelect={onSelect}
            onRetry={onRetry}
            onViewCategory={!quick && category === "all" ? onCategoryChange : undefined}
            listboxId={quick ? listId : undefined}
            activeId={activeId}
            renderAction={renderAction}
            resultHref={resultHref}
          />
        )}
        <SearchFeedback
          query={query}
          sections={sections}
          area={area}
          onClose={onClose}
          category={category}
          memberNotice={memberNotice}
          canCreate={canCreate}
        />
      </div>
      {quick && <QuickSearchFooter query={query} onViewAll={onViewAll} />}
      {!quick && (
        <SearchPagination
          category={category}
          sections={sections}
          onLoadMore={onLoadMore}
          loadingMore={loadingMore}
          loadMoreFailed={loadMoreFailed}
        />
      )}
    </div>
  );
}

/** The query field and whatever shares its row. Only the quick dialog
 * wires up the combobox relationship to the results; on the full page they
 * are just a region below the field. */
function SearchQueryRow({
  query,
  onQueryChange,
  category,
  quick,
  headerAction,
  onKeyDown,
  listId,
  activeId,
  expanded,
}: Pick<SearchSurfaceProps, "query" | "onQueryChange" | "category"> & {
  quick: boolean;
  headerAction?: ReactNode;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  listId: string;
  activeId: string | null;
  expanded: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <SearchInput
        label="Search Betabook"
        // Sharing the row means the field takes what Cancel leaves rather
        // than its standard width.
        className={headerAction ? "min-w-0 flex-1" : undefined}
        placeholder={SEARCH_PLACEHOLDERS[category]}
        value={query}
        onChange={onQueryChange}
        inputProps={{
          autoFocus: quick,
          onKeyDownCapture: onKeyDown,
          ...(quick
            ? {
                role: "combobox",
                "aria-autocomplete": "list",
                "aria-expanded": expanded,
                "aria-controls": expanded ? listId : undefined,
                "aria-activedescendant": activeId ? `${listId}-${activeId}` : undefined,
              }
            : {}),
        }}
      />
      {headerAction}
    </div>
  );
}

/** The quick dialog's category pills. The full page renders its own set
 * above the input, so this is only for the dialog.
 *
 * Compact keeps them on one non-wrapping line that scrolls sideways — with
 * a keyboard up, wrapping would cost the result list a row it needs. */
function SearchFilterRow({
  quick,
  compact,
  category,
  onCategoryChange,
}: Pick<SearchSurfaceProps, "category" | "onCategoryChange"> & {
  quick: boolean;
  compact: boolean;
}) {
  if (!quick) return null;
  return (
    <div
      className={clsx(
        "flex min-w-0 shrink-0",
        compact
          ? "-mx-1 [scrollbar-width:none] items-center gap-2 overflow-x-auto px-1"
          : "flex-col items-start gap-4",
      )}
    >
      <SearchCategories value={category} onChange={onCategoryChange} compact={compact} />
    </div>
  );
}

/** Renders the notice in exactly one of its two homes. */
function MemberNoticeSlot({
  notice,
  placement,
  at,
  className,
}: {
  notice: ReactNode;
  placement: "results" | "top";
  at: "results" | "top";
  className: string;
}) {
  return notice && placement === at ? <div className={className}>{notice}</div> : null;
}

function SearchFeedback({
  query,
  sections,
  area,
  onClose,
  category,
  memberNotice,
  canCreate,
}: Pick<
  SearchSurfaceProps,
  "query" | "sections" | "area" | "category" | "memberNotice" | "canCreate"
> & { onClose?: () => void }) {
  const noMatches =
    sections.every((section) => section.items.length === 0) &&
    sections.some((section) => section.status === "ready") &&
    sections.every((section) => section.status === "ready" || section.status === "locked");
  return (
    <>
      {noMatches && (
        <p role="status" className="text-sm text-muted">
          No matches. Try another name or clear a filter.
        </p>
      )}
      {category === "climber" &&
        sections.some((section) => section.status === "locked") &&
        !memberNotice && <p className="text-sm text-muted">Sign in to view climbers.</p>}
      {canCreate && (
        <SearchCreationLinks query={query} sections={sections} area={area} onClose={onClose} />
      )}
    </>
  );
}

function IdleResults({
  suggestions,
  ...props
}: Pick<
  SearchSurfaceProps,
  "suggestions" | "onSelect" | "onRetry" | "renderAction" | "resultHref"
>) {
  return suggestions?.items.length ? <SearchResults sections={[suggestions]} {...props} /> : null;
}

function SearchCreationLinks({
  query,
  sections,
  area,
  onClose,
}: Pick<SearchSurfaceProps, "query" | "sections" | "area"> & { onClose?: () => void }) {
  const missing = (kind: SearchKind) =>
    sections.some(
      (section) =>
        section.kind === kind && section.status === "ready" && section.items.length === 0,
    );
  const climb = missing("climb");
  const areaMissing = missing("area");
  if (!query.trim() || (!climb && !areaMissing)) return null;
  const params = new URLSearchParams({ name: query.trim() });
  if (area) params.set("areaId", area.id);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted">Can’t find what you’re looking for?</span>
      {climb && (
        <AppLink href={`/climbs/new?${params}`} onClick={onClose}>
          Add climb
        </AppLink>
      )}
      {areaMissing && (
        <AppLink href="/areas/new" onClick={onClose}>
          Add area
        </AppLink>
      )}
    </div>
  );
}

export function QuickSearchDialog({
  isOpen,
  onOpenChange,
  ...props
}: SearchSurfaceProps & { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const compact = useCompactViewport();
  const cancel = (
    <Button variant="ghost" size="sm" onPress={() => onOpenChange(false)}>
      Cancel
    </Button>
  );
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="top" size="lg" className="p-0 sm:p-4 sm:pt-12">
        <Modal.Dialog
          aria-label="Search Betabook"
          className="max-h-full rounded-none sm:max-h-[85dvh] sm:rounded-panel"
        >
          {/* This row holds one word and one button, and with a keyboard up
           * it costs about a fifth of the remaining height. Cancel moves
           * next to the input and the heading stays for screen readers. */}
          <Modal.Header
            className={clsx(
              "flex flex-row items-center justify-between gap-2",
              compact && "sr-only",
            )}
          >
            <Modal.Heading>Search</Modal.Heading>
            {!compact && cancel}
          </Modal.Header>
          <Modal.Body className="flex min-h-0 flex-col overflow-hidden">
            <SearchSurface
              {...props}
              quick
              compact={compact}
              onClose={() => onOpenChange(false)}
              headerAction={compact ? cancel : undefined}
            />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function QuickSearchFooter({ query, onViewAll }: Pick<SearchSurfaceProps, "query" | "onViewAll">) {
  return (
    <div className="shrink-0 border-t border-separator pt-3">
      <Button variant="ghost" className="w-full justify-between" onPress={onViewAll}>
        <span className="min-w-0 truncate">
          {query.trim() ? `View all results for “${query.trim()}”` : "Open full search"}
        </span>
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      </Button>
      <div className="mt-2 hidden flex-wrap gap-3 text-xs text-muted sm:flex">
        <span>
          <Kbd>↑↓</Kbd> move
        </span>
        <span>
          <Kbd>↵</Kbd> open selected
        </span>
        <span>
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </div>
  );
}

function useQuickSearchNavigation({
  query,
  category,
  area,
  sections,
  quick,
  onClose,
  onSelect,
  onViewAll,
}: Pick<
  SearchSurfaceProps,
  "query" | "category" | "area" | "sections" | "onSelect" | "onViewAll"
> & { quick: boolean; onClose?: () => void }) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const identity = JSON.stringify([query, category, area?.id]);
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  // A changed query/scope must forget the old explicit selection, including A → B → A.
  if (previousIdentity !== identity) {
    setPreviousIdentity(identity);
    setActive(null);
  }
  const items = sections.flatMap((section) =>
    section.status === "ready" ? section.items.filter((item) => !item.disabledReason) : [],
  );
  const activeId = items.some((item) => item.id === active) ? active : null;

  useEffect(() => {
    if (activeId)
      rootRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (quick && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      if (items.length === 0) return;
      const index = items.findIndex((item) => item.id === activeId);
      const next =
        index < 0
          ? event.key === "ArrowDown"
            ? 0
            : items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      setActive(items[next].id);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = items.find((item) => item.id === activeId);
      if (quick && picked && !event.metaKey && !event.ctrlKey) onSelect(picked);
      else onViewAll();
    }
  }

  return { rootRef, listId, activeId, onKeyDown };
}

function SearchPagination({
  category,
  sections,
  onLoadMore,
  loadingMore = false,
  loadMoreFailed = false,
}: Pick<
  SearchSurfaceProps,
  "category" | "sections" | "onLoadMore" | "loadingMore" | "loadMoreFailed"
>) {
  if (category === "all" || !sections.some((section) => section.hasMore) || !onLoadMore)
    return null;
  return <LoadMoreButton onPress={onLoadMore} loading={loadingMore} failed={loadMoreFailed} />;
}
