"use client";

import { IndexRangeSelect } from "@/components/ui/index-select";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";
import { BOULDER_HUECO, ROPE_YDS } from "@/lib/grades";

/** One min/max grade range per checked discipline — the expanded half of
 * every filter toolbar. Generic over `T` since each caller's filter type
 * carries its own extra fields (rating range, ascent styles, …) that
 * `onChange` must round-trip through the spreads below without losing. */
export function DisciplineGradeSliders<T extends DisciplineFilter>({
  value,
  onChange,
}: {
  value: T;
  onChange: (value: T) => void;
}) {
  const showBoulder = value.disciplines.includes("boulder");
  const showSport = value.disciplines.includes("sport");
  const showTrad = value.disciplines.includes("trad");

  // Nothing selected means no grade scale applies. Returning null rather
  // than an empty flex container matters in the toolbar's expanded panel,
  // where an empty child still claims a gap and opens a visible hole above
  // the footer.
  if (!showBoulder && !showSport && !showTrad) return null;

  return (
    <div className="flex flex-col gap-4">
      {showBoulder && (
        <IndexRangeSelect
          label="Boulder"
          minOptions={BOULDER_HUECO}
          maxOptions={BOULDER_HUECO}
          minLabel="Min grade"
          maxLabel="Max grade"
          range={value.boulderRange}
          onChange={(boulderRange) => onChange({ ...value, boulderRange })}
        />
      )}

      {showSport && (
        <IndexRangeSelect
          label="Sport"
          minOptions={ROPE_YDS}
          maxOptions={ROPE_YDS}
          minLabel="Min grade"
          maxLabel="Max grade"
          range={value.sportRange}
          onChange={(sportRange) => onChange({ ...value, sportRange })}
        />
      )}

      {showTrad && (
        <IndexRangeSelect
          label="Trad"
          minOptions={ROPE_YDS}
          maxOptions={ROPE_YDS}
          minLabel="Min grade"
          maxLabel="Max grade"
          range={value.tradRange}
          onChange={(tradRange) => onChange({ ...value, tradRange })}
        />
      )}
    </div>
  );
}
