"use client";

import { buttonVariants, Disclosure } from "@heroui/react";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { ActiveFilterSummary, type ActiveFilter } from "@/components/filters/active-filter-summary";
import { disciplineActiveFilters } from "@/components/filters/active-filter-values";
import { DisciplineChips } from "@/components/filters/discipline-chips";
import { DisciplineGradeSliders } from "@/components/filters/discipline-grade-sliders";
import { cardClass } from "@/components/ui/card";
import { FIELD_HEIGHT_CLASS } from "@/components/ui/field";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";

const EMPTY_ACTIVE_FILTERS: ActiveFilter[] = [];

/** Narrows an existing list with text, discipline, date, hashtag, and other filters.
 * `textFilter` never renders a separate record-results menu. */
export function FilterToolbar<T extends DisciplineFilter>({
  value,
  onChange,
  onReset,
  textFilter,
  sortControl,
  extraFilters,
  activeFilters = EMPTY_ACTIVE_FILTERS,
}: {
  value: T;
  onChange: (value: T) => void;
  onReset: () => void;
  textFilter?: ReactNode;
  sortControl?: ReactNode;
  /** Rendered in the expanded panel above the grade sliders — the filters
   * that are specific to one list (rating range, ascent style, …). */
  extraFilters?: ReactNode;
  activeFilters?: ActiveFilter[];
}) {
  return (
    <FilterToolbarLayout
      activeFilters={[...disciplineActiveFilters(value, onChange), ...activeFilters]}
      search={textFilter}
      controls={
        <DisciplineChips
          value={value.disciplines}
          onChange={(disciplines) => onChange({ ...value, disciplines })}
        />
      }
      sortControl={sortControl}
      filters={
        <>
          {extraFilters}
          <DisciplineGradeSliders value={value} onChange={onChange} />
        </>
      }
      onReset={onReset}
    />
  );
}

/** Shared disclosure, panel, and reset action for list filters. Below a 48rem
 * toolbar, search and sort share the first row above the choices and toggle;
 * wider, everything sits on one row. Sort never moves when the panel opens. */
export function FilterToolbarLayout({
  search,
  controls,
  sortControl,
  filters,
  onReset,
  activeFilters = EMPTY_ACTIVE_FILTERS,
  triggerClassName,
}: {
  search?: ReactNode;
  controls: ReactNode;
  triggerClassName?: string;
  sortControl?: ReactNode;
  filters: ReactNode;
  activeFilters?: ActiveFilter[];
  onReset: () => void;
}) {
  const sort = sortControl && (
    <div
      role="group"
      aria-label="Result order"
      className={clsx(
        "flex min-w-0",
        search ? "col-start-2 row-start-1 @3xl/filters:ml-auto" : "ml-auto",
      )}
    >
      {sortControl}
    </div>
  );
  return (
    <div className="@container/filters min-w-0">
      <Disclosure>
        {({ isExpanded }) => (
          <>
            <div
              role="group"
              aria-label="Filter controls"
              className={clsx(
                "grid gap-2 @3xl/filters:flex @3xl/filters:items-center @3xl/filters:gap-3",
                search && sortControl ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
              )}
            >
              {search && (
                <div className="min-w-0 @3xl/filters:w-96 @3xl/filters:shrink">{search}</div>
              )}
              <div className="col-span-full flex min-w-0 flex-wrap items-center gap-2 @3xl/filters:contents">
                {controls}
                <Disclosure.Heading className="contents">
                  <Disclosure.Trigger
                    // The visible label stays short; the name says what pressing does next.
                    aria-label={isExpanded ? "Hide filters" : "Expand filters"}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: clsx(
                        FIELD_HEIGHT_CLASS,
                        (search || !sortControl) && "ml-auto @3xl/filters:ml-0",
                        triggerClassName,
                      ),
                    })}
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4" aria-hidden />
                    )}
                    Filters
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                {!search && sort}
              </div>
              {search && sort}
            </div>

            <ActiveFilterSummary filters={activeFilters} onClear={onReset} />

            {/* Disclosure.Body's own p-2 comes from an outer wrapper div this
             * component doesn't expose a className for — style is the only prop
             * that reaches it, so the padding is zeroed there and the panel
             * below owns its own spacing. */}
            <Disclosure.Content className="min-w-0">
              <Disclosure.Body style={{ padding: 0 }}>
                {/* Its own surface, so the expanded filters read as one panel
                 * belonging to the bar rather than loose page content. */}
                <section
                  aria-label="Filter options"
                  className={`mt-3 flex flex-col gap-4 border border-border ${cardClass("sm")}`}
                >
                  {filters}
                </section>
              </Disclosure.Body>
            </Disclosure.Content>
          </>
        )}
      </Disclosure>
    </div>
  );
}
