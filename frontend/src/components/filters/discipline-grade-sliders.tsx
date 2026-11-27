"use client";

import { useGradePreferences } from "@/components/ui/grade-preferences";
import { IndexRangeSelect } from "@/components/ui/index-select";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";
import { gradeLabelGroups, type ClimbType, type GradePreferences } from "@/lib/grades";

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
  const prefs = useGradePreferences();
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
        <GradeRangeSelect
          label="Boulder"
          type="boulder"
          prefs={prefs}
          range={value.boulderRange}
          onChange={(boulderRange) => onChange({ ...value, boulderRange })}
        />
      )}

      {showSport && (
        <GradeRangeSelect
          label="Sport"
          type="sport"
          prefs={prefs}
          range={value.sportRange}
          onChange={(sportRange) => onChange({ ...value, sportRange })}
        />
      )}

      {showTrad && (
        <GradeRangeSelect
          label="Trad"
          type="trad"
          prefs={prefs}
          range={value.tradRange}
          onChange={(tradRange) => onChange({ ...value, tradRange })}
        />
      )}
    </div>
  );
}

/** The range selects list one entry per distinct label in the viewer's scale
 * while the filter itself stays in ordinals, so a shared URL means the same
 * climbs whatever the reader's systems. Where one label covers two ordinals
 * (French 2 for 5.1 and 5.2) the lower bound takes the group's first ordinal
 * and the upper bound its last, so "2 – 7a" includes every climb printed as 2. */
function GradeRangeSelect({
  label,
  type,
  prefs,
  range,
  onChange,
}: {
  label: string;
  type: ClimbType;
  prefs: GradePreferences;
  range: [number, number];
  onChange: (range: [number, number]) => void;
}) {
  const groups = gradeLabelGroups(type, prefs);
  const groupIndex = (ordinal: number) => {
    const i = groups.findIndex((group) => ordinal >= group.min && ordinal <= group.max);
    return i === -1 ? Math.min(Math.max(ordinal, 0), groups.length - 1) : i;
  };
  return (
    <IndexRangeSelect
      label={label}
      options={groups.map((group) => group.label)}
      minLabel="Min grade"
      maxLabel="Max grade"
      range={[groupIndex(range[0]), groupIndex(range[1])]}
      onChange={([min, max]) => onChange([groups[min].min, groups[max].max])}
    />
  );
}
