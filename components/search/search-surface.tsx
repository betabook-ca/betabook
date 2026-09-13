"use client";
import { Button, Kbd, Modal } from "@heroui/react";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreButton } from "@/components/ui/load-more-button";
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
  suggestedArea?: AreaSelection;
  onAreaChange: (area: AreaSelection | null) => void;
  filters?: ReactNode;
  memberNotice?: ReactNode;
  renderAction?: (item: SearchResult) => ReactNode;
  resultHref?: (item: SearchResult) => string | undefined;
};

const SEARCH_PLACEHOLDERS: Record<SearchCategory, string> = {
  all: "Search climbs, areas, and climbers…",
  climb: "Search climbs…",
  area: "Search areas…",
  climber: "Search climbers…",
};

const SEARCH_PROMPTS: Record<SearchCategory, string> = {
  all: "Search climbs, areas, or climbers by name.",
  climb: "Search climbs by name.",
  area: "Search areas by name.",
  climber: "Search climbers by name.",
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
  suggestedArea,
  onAreaChange,
  filters,
  memberNotice,
  renderAction,
  resultHref,
  quick = false,
  onClose,
}: SearchSurfaceProps & { quick?: boolean; onClose?: () => void }) {
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
  const idle = sections.every((section) => section.status === "idle");
  return (
    <div ref={rootRef} className={`flex min-h-0 min-w-0 flex-col gap-4 ${quick ? "flex-1" : ""}`}>
      <div className="shrink-0">
        <SearchInput
          label="Search Betabook"
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
                  "aria-expanded": !idle && hasResults,
                  "aria-controls": idle || !hasResults ? undefined : listId,
                  "aria-activedescendant": activeId ? `${listId}-${activeId}` : undefined,
                }
              : {}),
          }}
        />
      </div>
      <SearchCategories value={category} onChange={onCategoryChange} />
      <SearchScope
        category={category}
        area={area}
        suggestedArea={suggestedArea}
        quick={quick}
        onAreaChange={onAreaChange}
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
        {memberNotice && <div className="mb-4">{memberNotice}</div>}
        {idle ? (
          <IdleResults
            category={category}
            suggestions={suggestions}
            onSelect={onSelect}
            onRetry={onRetry}
            renderAction={renderAction}
            resultHref={resultHref}
          />
        ) : (
          <SearchResults
            sections={sections}
            onSelect={onSelect}
            onRetry={onRetry}
            onViewCategory={!quick && category === "all" ? onCategoryChange : undefined}
            listboxId={quick ? listId : undefined}
            activeId={activeId}
            renderAction={renderAction}
            resultHref={resultHref}
          />
        )}
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

function IdleResults({
  category,
  suggestions,
  ...props
}: Pick<
  SearchSurfaceProps,
  "category" | "suggestions" | "onSelect" | "onRetry" | "renderAction" | "resultHref"
>) {
  return suggestions?.items.length ? (
    <SearchResults sections={[suggestions]} {...props} />
  ) : (
    <EmptyState message={SEARCH_PROMPTS[category]} />
  );
}

export function QuickSearchDialog({
  isOpen,
  onOpenChange,
  ...props
}: SearchSurfaceProps & { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container placement="top" size="lg" className="p-0 sm:p-4 sm:pt-12">
        <Modal.Dialog
          aria-label="Search Betabook"
          className="max-h-full rounded-none sm:max-h-[85dvh] sm:rounded-panel"
        >
          <Modal.Header className="flex flex-row items-center justify-between gap-2">
            <Modal.Heading>Search</Modal.Heading>
            <Button variant="ghost" size="sm" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
          </Modal.Header>
          <Modal.Body className="flex min-h-0 flex-col overflow-hidden">
            <SearchSurface {...props} quick onClose={() => onOpenChange(false)} />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function SearchScope({
  category,
  area,
  suggestedArea,
  quick,
  onAreaChange,
  onCategoryChange,
}: Pick<
  SearchSurfaceProps,
  "category" | "area" | "suggestedArea" | "onAreaChange" | "onCategoryChange"
> & {
  quick: boolean;
}) {
  const [dismissedAreaId, setDismissedAreaId] = useState<string | null>(null);
  if (category !== "all" && category !== "climb") return null;
  if (area && quick)
    return (
      <Button
        variant="secondary"
        size="sm"
        className="max-w-full shrink-0 self-start"
        onPress={() => {
          setDismissedAreaId(area.id);
          onAreaChange(null);
        }}
        aria-label={`Clear area ${area.name}`}
      >
        <span className="truncate">Climbs in {area.name}</span>
        <X className="size-3.5 shrink-0" aria-hidden />
      </Button>
    );
  if (area || !suggestedArea || suggestedArea.id === dismissedAreaId) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="max-w-full shrink-0 self-start"
      onPress={() => {
        onCategoryChange("climb");
        onAreaChange(suggestedArea);
      }}
    >
      <span className="truncate">Climbs in {suggestedArea.name}</span>
    </Button>
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
  const [active, setActive] = useState<{ key: string; id: string } | null>(null);
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
  const activeId =
    active?.key === identity && items.some((item) => item.id === active.id) ? active.id : null;

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
      setActive({ key: identity, id: items[next].id });
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
