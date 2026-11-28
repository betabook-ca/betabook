"use client";

import {
  DISCIPLINE_CHIP_CLASSNAME,
  DISCIPLINE_LABELS,
} from "@/components/climbing/discipline-chip";
import { choicePillClass } from "@/components/ui/choice-pill";
import { ChoicePills } from "@/components/ui/choice-pills";
import { FILTER_PILL_CLASS } from "@/components/ui/field";
import type { Discipline } from "@/lib/grades";

const DISCIPLINES: Discipline[] = ["boulder", "sport", "trad"];

/** Discipline toggles as the same palette chips the rows themselves wear —
 * three taps instead of a labelled checkbox group, which is what lets a whole
 * filter fit on one line. Shared by the list toolbars (via FilterToolbar) and
 * the climb picker, so "narrow by discipline" is one control everywhere.
 *
 * Multi-select, and none selected means all — the convention every filter in
 * the app follows (see toDisciplineGradeFilter). `single` narrows to one
 * discipline at a time for pickers that choose one climb, where combining
 * disciplines only widens the list; tapping the chosen chip clears it. */
export function DisciplineChips({
  value,
  onChange,
  single = false,
}: {
  value: Discipline[];
  onChange: (value: Discipline[]) => void;
  single?: boolean;
}) {
  return (
    <ChoicePills
      label="Disciplines"
      selectionMode={single ? "single" : "multiple"}
      allowEmpty
      value={value}
      onChange={onChange}
      options={DISCIPLINES.map((discipline) => ({
        value: discipline,
        label: DISCIPLINE_LABELS[discipline],
      }))}
      pillClass={(selected, discipline) =>
        `${choicePillClass(selected, DISCIPLINE_CHIP_CLASSNAME[discipline])} ${FILTER_PILL_CLASS}`
      }
      className="flex items-center gap-1.5"
    />
  );
}
