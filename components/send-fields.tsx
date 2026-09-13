"use client";

import { Label, TextField } from "@heroui/react";
import type { ReactNode } from "react";

import { ASCENT_STYLE_CHIP_CLASSNAME, ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { choicePillClass } from "@/components/ui/choice-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { OptionSelect } from "@/components/ui/option-select";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import { ascentStylesFor, GRADE_FEEL_VALUES, type AscentStyle, type GradeFeel } from "@/lib/sends";

export function FormSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </section>
  );
}

export const GRADE_FEEL_LABELS: Record<GradeFeel, string> = {
  low: "Low end",
  solid: "Solid",
  high: "High end",
};

const GRADE_FEEL_OPTIONS = GRADE_FEEL_VALUES.map((value) => ({
  value,
  label: GRADE_FEEL_LABELS[value],
}));

/** Boulders offer Redpoint and Flash only — see ascentStylesFor. */
export function AscentStylePicker({
  climbType,
  value,
  onChange,
}: {
  climbType: ClimbType;
  value: AscentStyle;
  onChange: (value: AscentStyle) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Ascent style" className="flex flex-wrap gap-1.5">
      {ascentStylesFor(climbType).map((style) => {
        const selected = value === style;
        return (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(style)}
            className={choicePillClass(selected, ASCENT_STYLE_CHIP_CLASSNAME[style])}
          >
            {ASCENT_STYLE_LABELS[style]}
          </button>
        );
      })}
    </div>
  );
}

export type SendStyleChoice = AscentStyle | "session" | "repeat";

// Repeats carry no ascent style, so the pill wears the same neutral selected
// pair as Session rather than an ascent-style chip color.
const PLAIN_CHOICE_CLASSNAME = "bg-foreground text-background";

/** One pill row deciding what the entry records: Session logs plain time on
 * the climb, while any ascent style marks it as a send in that style. A climb
 * with a prior send offers Repeat instead of styles — style, rating and grade
 * stay with the recorded ascent. */
export function SendStylePicker({
  climbType,
  value,
  onChange,
  hasPriorSend = false,
}: {
  climbType: ClimbType;
  value: SendStyleChoice;
  onChange: (value: SendStyleChoice) => void;
  hasPriorSend?: boolean;
}) {
  const sendChoices: { choice: SendStyleChoice; label: string; className: string }[] = hasPriorSend
    ? [{ choice: "repeat", label: "Repeat", className: PLAIN_CHOICE_CLASSNAME }]
    : ascentStylesFor(climbType).map((style) => ({
        choice: style,
        label: ASCENT_STYLE_LABELS[style],
        className: ASCENT_STYLE_CHIP_CLASSNAME[style],
      }));
  const choices = [
    { choice: "session" as const, label: "Session", className: PLAIN_CHOICE_CLASSNAME },
    ...sendChoices,
  ];
  return (
    <div
      role="radiogroup"
      aria-label={hasPriorSend ? "Session or repeat" : "Session or send"}
      className="flex flex-wrap gap-1.5"
    >
      {choices.map(({ choice, label, className }) => {
        const selected = value === choice;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice)}
            className={choicePillClass(selected, className)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function SuggestedGradeField({
  climbType,
  value,
  onChange,
}: {
  climbType: ClimbType;
  value: string;
  onChange: (value: string) => void;
}) {
  const gradeOptions = nativeGradeArray(climbType);

  return (
    <TextField>
      <Label>Suggested grade</Label>
      <OptionSelect
        ariaLabel="Suggested grade"
        className={FIELD_WIDTH_CLASS.short}
        value={value}
        onChange={onChange}
        options={gradeOptions.map((label, i) => ({ value: String(i), label }))}
      />
    </TextField>
  );
}

export function GradeFeelField({
  value,
  onChange,
}: {
  value: GradeFeel;
  onChange: (value: GradeFeel) => void;
}) {
  return (
    <TextField>
      <Label>Grade feel</Label>
      <SegmentedButtons value={value} onChange={onChange} options={GRADE_FEEL_OPTIONS} />
    </TextField>
  );
}
