import { Button, useOverlayState } from "@heroui/react";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { ratingActiveFilters } from "@/components/filters/active-filter-values";
import { ClimbFilters } from "@/components/filters/climb-filters";
import { RatingRangeFilter } from "@/components/filters/min-rating-filter";
import { SearchPicker } from "@/components/search/search-picker";
import { SearchSelectionField } from "@/components/search/search-selection-field";
import { QuickSearchDialog, SearchSurface } from "@/components/search/search-surface";
import type { SearchResult, SearchStatus } from "@/components/search/search-types";
import { cardClass } from "@/components/ui/card";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { OptionSelect } from "@/components/ui/option-select";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaSelection } from "@/lib/area-selection";
import type { ClimbRefinements } from "@/lib/filters/climb-refinements";

import { SAMPLE_AREAS, CATALOG_FIXTURES } from "./catalog-data";
import { DEFAULT_CLIMB_REFINEMENTS } from "./climb-refinements";
import { StoryPage } from "./story-layout";
import { useSearchDemo, type SearchScenario } from "./use-search-demo";

function SelectedResult({ item, onClear }: { item: SearchResult | null; onClear: () => void }) {
  if (!item) return null;
  return (
    <div className={`${cardClass("sm")} mt-4 flex flex-wrap items-center justify-between gap-3`}>
      <output aria-label="Selected record" data-selected-id={item.id}>
        <span className="block text-sm font-medium">Selected: {item.name}</span>
        <span className="block text-xs text-muted">{item.detail}</span>
      </output>
      <Button variant="ghost" size="sm" onPress={onClear}>
        Clear selection
      </Button>
    </div>
  );
}

function DemoAreaControl({
  selected,
  onChange,
}: {
  selected: AreaSelection | null;
  onChange: (area: AreaSelection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const items = CATALOG_FIXTURES.filter(
    (item) => item.kind === "area" && item.name.toLowerCase().includes(settled.toLowerCase()),
  );
  return (
    <SearchSelectionField
      label="In area"
      query={query}
      onQueryChange={setQuery}
      items={items}
      status={query === settled ? "ready" : "loading"}
      selectedId={selected?.id}
      onRetry={() => setSettled(query)}
      onSelect={(item) => {
        onChange(SAMPLE_AREAS.find((area) => area.id === item.id) ?? null);
        setQuery("");
      }}
    />
  );
}

/** ClimbFilters over the fixture catalog: name sort, a rating range and the
 * area picker, without the app's URL-backed filter state. */
export function DemoClimbFilters({
  value,
  onChange,
  showSort = true,
}: {
  value: ClimbRefinements;
  onChange: (value: ClimbRefinements) => void;
  showSort?: boolean;
}) {
  return (
    <ClimbFilters
      value={value}
      onChange={onChange}
      areaControl={
        <DemoAreaControl selected={value.area} onChange={(area) => onChange({ ...value, area })} />
      }
      activeFilters={ratingActiveFilters(
        [value.minRating, value.maxRating],
        ([minRating, maxRating]) => onChange({ ...value, minRating, maxRating }),
      )}
      sortControl={
        showSort ? (
          <OptionSelect
            ariaLabel="Sort results"
            value={value.sort}
            onChange={(sort) => onChange({ ...value, sort })}
            options={[
              { value: "name_asc", label: "Name A–Z" },
              { value: "name_desc", label: "Name Z–A" },
            ]}
            className={FIELD_WIDTH_CLASS.medium}
          />
        ) : undefined
      }
      ratingControl={
        <RatingRangeFilter
          value={[value.minRating, value.maxRating]}
          onChange={([minRating, maxRating]) => onChange({ ...value, minRating, maxRating })}
        />
      }
      onReset={() => onChange(DEFAULT_CLIMB_REFINEMENTS)}
    />
  );
}

export function SearchDemo({
  surface = "full",
  scenario = "ready",
  initialOpen = false,
}: {
  surface?: "quick" | "full" | "journey";
  scenario?: SearchScenario;
  initialOpen?: boolean;
}) {
  const [full, setFull] = useState(surface === "full");
  const demo = useSearchDemo({ scenario, limit: full ? 5 : 3 });
  const overlay = useOverlayState({ defaultOpen: initialOpen });
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const onSelect = (item: SearchResult) => {
    setSelected(item);
    overlay.close();
  };
  function viewAll() {
    overlay.close();
    setFull(true);
  }
  const props = {
    canCreate: true,
    query: demo.query,
    onQueryChange: demo.setQuery,
    category: demo.category,
    onCategoryChange: demo.changeCategory,
    sections: demo.sections,
    onSelect,
    onRetry: demo.retry,
    onViewAll: viewAll,
    onLoadMore: demo.loadMore,
    loadingMore: demo.pending,
    area: demo.filters.area,
    onAreaChange: (area: AreaSelection | null) => demo.setFilters({ ...demo.filters, area }),
  };
  return (
    <StoryPage
      title={
        surface === "journey" ? "Search journey" : surface === "quick" ? "Quick search" : "Search"
      }
      description="Shared search presentation · sample data and local interactions."
    >
      {full ? (
        <SearchSurface
          {...props}
          filters={
            demo.category === "climb" ? (
              <DemoClimbFilters value={demo.filters} onChange={demo.setFilters} />
            ) : undefined
          }
        />
      ) : (
        <div className={`${cardClass("sm", "bordered")} flex flex-col gap-4`}>
          <SectionHeading>Cedar Grove</SectionHeading>
          <p className="text-sm text-muted">
            North Woods · Search globally or choose this area explicitly.
          </p>
          <Button variant="secondary" onPress={overlay.open} className="self-start">
            <Search className="size-4" aria-hidden />
            Search Betabook
          </Button>
        </div>
      )}
      {full && (
        <Button variant="ghost" className="self-start" onPress={overlay.open}>
          Open quick search
        </Button>
      )}
      <QuickSearchDialog {...props} isOpen={overlay.isOpen} onOpenChange={overlay.setOpen} />
      <SelectedResult item={selected} onClear={() => setSelected(null)} />
    </StoryPage>
  );
}

/** The quick dialog with a mobile keyboard open: Cancel moves next to the
 * input, and the category pills and area chip share one scrolling line.
 *
 * Framed at the height a 375x812 phone has left with a keyboard up. The
 * gallery's own viewports are too tall to trigger this state on their
 * own. */
export function QuickSearchCompactDemo({ scenario = "ready" }: { scenario?: SearchScenario }) {
  const demo = useSearchDemo({ scenario, limit: 3 });
  const [selected, setSelected] = useState<SearchResult | null>(null);
  return (
    <StoryPage
      title="Quick search with a keyboard up"
      description="Shared search presentation · sample data and local interactions."
    >
      <div
        className={`${cardClass("sm", "bordered")} flex h-[382px] flex-col overflow-hidden`}
        aria-label="Keyboard-sized frame"
      >
        <SearchSurface
          canCreate
          quick
          compact
          query={demo.query}
          onQueryChange={demo.setQuery}
          category={demo.category}
          onCategoryChange={demo.changeCategory}
          sections={demo.sections}
          onSelect={setSelected}
          onRetry={demo.retry}
          onViewAll={() => {}}
          area={demo.filters.area}
          headerAction={
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          }
        />
      </div>
      <SelectedResult item={selected} onClear={() => setSelected(null)} />
    </StoryPage>
  );
}

export function ClimbPickerDemo({
  mode = "logging",
  selectedInitially = false,
}: {
  mode?: "logging" | "import" | "merge";
  selectedInitially?: boolean;
}) {
  const demo = useSearchDemo({ initialCategory: "climb", limit: 4, pickerMode: mode });
  const [selected, setSelected] = useState<SearchResult | null>(
    selectedInitially ? CATALOG_FIXTURES[0] : null,
  );
  const title =
    mode === "import"
      ? "Find “Cedar Arete”"
      : mode === "merge"
        ? "Choose a merge destination"
        : "Log session";
  return (
    <StoryPage
      title={title}
      description={
        mode === "merge"
          ? "The current climb is disabled. Choosing a destination does not merge records."
          : mode === "import"
            ? "Search is seeded from a sample import row. Choosing a climb matches only this row."
            : "Already logged climbs remain available for repeats. Choosing a climb does not save a session."
      }
    >
      <SearchPicker
        query={demo.query}
        onQueryChange={demo.setQuery}
        section={demo.sections[0]}
        onPick={setSelected}
        onRetry={() => demo.retry("climb")}
        selectedId={selected?.id}
        onLoadMore={demo.loadMore}
        loadingMore={demo.pending}
        filters={<DemoClimbFilters value={demo.filters} onChange={demo.setFilters} />}
      />
      <SelectedResult item={selected} onClear={() => setSelected(null)} />
    </StoryPage>
  );
}

export function SelectionDemo({ kind = "area" }: { kind?: "area" | "climber" }) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [selected, setSelected] = useState<SearchResult[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const items = CATALOG_FIXTURES.filter(
    (item) =>
      item.kind === kind &&
      (kind !== "climber" || item.friend) &&
      item.name.toLowerCase().includes(settled.toLowerCase()) &&
      !selected.some((chosen) => chosen.id === item.id),
  );
  const status: SearchStatus = query === settled ? "ready" : "loading";
  return (
    <StoryPage
      title={kind === "area" ? "Choose an area" : "Tagged friends"}
      description={
        kind === "area"
          ? "Choose a specific area. Free text cannot identify a record; duplicate names keep their location visible."
          : "Only eligible friends appear. Tags remain local to this example."
      }
    >
      <SearchSelectionField
        label={kind === "area" ? "Area" : "Find a friend"}
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          if (kind === "area") setSelected([]);
        }}
        items={items}
        status={status}
        selectedId={kind === "area" ? selected[0]?.id : null}
        onRetry={() => setSettled(query)}
        onSelect={(item) => {
          setSelected(kind === "area" ? [item] : [...selected, item]);
          setQuery("");
        }}
      />
      {kind === "area" ? (
        <SelectedResult item={selected[0] ?? null} onClear={() => setSelected([])} />
      ) : (
        <>
          <ul aria-label="Selected friends" className="flex flex-wrap gap-2">
            {selected.map((item) => (
              <li key={item.id}>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Remove ${item.name}`}
                  onPress={() => setSelected(selected.filter((chosen) => chosen.id !== item.id))}
                >
                  {item.name} ×
                </Button>
              </li>
            ))}
          </ul>
          <output aria-label="Selected friends count" className="text-sm text-muted">
            {selected.length} friends selected
          </output>
        </>
      )}
    </StoryPage>
  );
}
