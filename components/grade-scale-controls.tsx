"use client";

import { useState, useTransition } from "react";

import { setGradePreferences } from "@/actions";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { SETTINGS_ROW_CLASS, SETTINGS_ROWS_CLASS, SettingsRow } from "@/components/ui/settings";
import { BOULDER_GRADE_SCALES, ROPE_GRADE_SCALES } from "@/lib/grade-preferences";
import { formatGrade, type GradePreferences } from "@/lib/grades";

const SAVE_FAILED_MESSAGE = "Couldn't save your grading systems. Try again.";

/** V4 and 5.11d: mid-scale grades most climbers can place in either system. */
const EXAMPLE_BOULDER = 5;
const EXAMPLE_ROUTE = 17;

const BOULDER_OPTIONS = BOULDER_GRADE_SCALES.map((scale) => ({
  value: scale.value,
  label: scale.label,
  hint: formatGrade("boulder", EXAMPLE_BOULDER, { boulder: scale.value, rope: "yds" }),
}));

const ROPE_OPTIONS = ROPE_GRADE_SCALES.map((scale) => ({
  value: scale.value,
  label: scale.label,
  hint: formatGrade("sport", EXAMPLE_ROUTE, { boulder: "hueco", rope: scale.value }),
}));

/** The two Preferences rows that choose boulder and route grading systems.
 * A segmented control rather than a switch: both systems stay visible with
 * an example grade each, so the choice reads the same to a climber who knows
 * only one of the names. Optimistic, like PrivacyControls: the segment
 * changes at once and reverts with a message if the save fails. State lives
 * here rather than in the provider because the rerender after the action
 * reuses the request's memoized session. */
export function GradeScaleControls({ initial }: { initial: GradePreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: GradePreferences) {
    if (next.boulder === prefs.boulder && next.rope === prefs.rope) return;
    const previous = prefs;
    setPrefs(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setGradePreferences(next);
        if (!result.ok) {
          setPrefs(previous);
          setError(result.error);
        }
      } catch {
        setPrefs(previous);
        setError(SAVE_FAILED_MESSAGE);
      }
    });
  }

  return (
    <div className={SETTINGS_ROWS_CLASS}>
      <SettingsRow
        title="Boulder grades"
        description="Wherever a boulder grade is shown or picked."
      >
        <SegmentedButtons
          ariaLabel="Boulder grading system"
          value={prefs.boulder}
          onChange={(boulder) => save({ ...prefs, boulder })}
          options={BOULDER_OPTIONS}
          isDisabled={isPending}
        />
      </SettingsRow>
      <SettingsRow
        title="Route grades"
        description="Wherever a sport or trad grade is shown or picked."
      >
        <SegmentedButtons
          ariaLabel="Route grading system"
          value={prefs.rope}
          onChange={(rope) => save({ ...prefs, rope })}
          options={ROPE_OPTIONS}
          isDisabled={isPending}
        />
      </SettingsRow>
      {error && (
        <div className={SETTINGS_ROW_CLASS}>
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}
    </div>
  );
}
