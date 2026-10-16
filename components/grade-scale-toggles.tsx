"use client";

import { Switch } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { setGradePreferences } from "@/actions";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SETTINGS_ROW_CLASS, SETTINGS_ROWS_CLASS } from "@/components/ui/settings";
import { BOULDER_GRADE_SCALES, ROPE_GRADE_SCALES } from "@/lib/grade-preferences";
import { formatGrade, type GradePreferences } from "@/lib/grades";

const SAVE_FAILED_MESSAGE = "Couldn't save your grading systems. Try again.";

/** The two Preferences rows that switch boulder and route grades between the
 * catalog's native systems and the European ones. Optimistic, like
 * PrivacyControls: the switch flips at once and flips back with a message if
 * the save fails. State lives here rather than in the provider because the
 * rerender after the action reuses the request's memoized session. */
export function GradeScaleToggles({ initial }: { initial: GradePreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: GradePreferences) {
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
      <ScaleRow
        title="Boulder grades"
        switchLabel={BOULDER_GRADE_SCALES[1].label}
        isOn={prefs.boulder === "font"}
        description={
          prefs.boulder === "font"
            ? `${formatGrade("boulder", 5)} shows as ${formatGrade("boulder", 5, prefs)}.`
            : `${BOULDER_GRADE_SCALES[0].label}, as the catalog grades them.`
        }
        isPending={isPending}
        onChange={(on) => save({ ...prefs, boulder: on ? "font" : "hueco" })}
      />
      <ScaleRow
        title="Route grades"
        switchLabel={ROPE_GRADE_SCALES[1].label}
        isOn={prefs.rope === "french"}
        description={
          prefs.rope === "french"
            ? `${formatGrade("sport", 17)} shows as ${formatGrade("sport", 17, prefs)}.`
            : `${ROPE_GRADE_SCALES[0].label}, as the catalog grades them.`
        }
        isPending={isPending}
        onChange={(on) => save({ ...prefs, rope: on ? "french" : "yds" })}
      />
      {error && (
        <div className={SETTINGS_ROW_CLASS}>
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}
    </div>
  );
}

function ScaleRow({
  title,
  switchLabel,
  isOn,
  description,
  isPending,
  onChange,
}: {
  title: string;
  switchLabel: string;
  isOn: boolean;
  description: string;
  isPending: boolean;
  onChange: (on: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-0.5 ${SETTINGS_ROW_CLASS}`}
    >
      <h3 className="col-start-1 row-start-1 text-sm font-medium">{title}</h3>
      {/* Outside Switch: a saving switch fades its own description below AA contrast. */}
      <p id={descriptionId} className="col-start-1 row-start-2 text-sm text-pretty text-muted">
        {description}
      </p>
      <Switch
        className="col-start-2 row-span-2 row-start-1"
        isDisabled={isPending}
        isSelected={isOn}
        onChange={onChange}
        aria-describedby={descriptionId}
      >
        <Switch.Content className="gap-3">
          <span className="text-sm">{switchLabel}</span>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}
