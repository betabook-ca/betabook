"use client";

import { Label, TextField } from "@heroui/react";
import { useRef, type ReactNode } from "react";

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

const GRADE_FEEL_LABELS: Record<GradeFeel, string> = {
  low: "Low end",
  solid: "Solid",
  high: "High end",
};

export const GRADE_FEEL_OPTIONS = GRADE_FEEL_VALUES.map((value) => ({
  value,
  label: GRADE_FEEL_LABELS[value],
}));

type PillChoice<T extends string> = { value: T; label: string; className: string };

/** Radio pills with one tab stop; arrow keys move the selection. */
function PillRadioGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: PillChoice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = choices.findIndex((choice) => choice.value === value);
  const tabbable = selectedIndex === -1 ? 0 : selectedIndex;

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {choices.map((choice, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabbable ? 0 : -1}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!step) return;
              event.preventDefault();
              const next = (index + step + choices.length) % choices.length;
              onChange(choices[next].value);
              buttons.current[next]?.focus();
            }}
            onClick={() => onChange(choice.value)}
            className={choicePillClass(selected, choice.className)}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

function ascentStyleChoices(climbType: ClimbType): PillChoice<AscentStyle>[] {
  return ascentStylesFor(climbType).map((style) => ({
    value: style,
    label: ASCENT_STYLE_LABELS[style],
    className: ASCENT_STYLE_CHIP_CLASSNAME[style],
  }));
}

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
    <PillRadioGroup
      label="Ascent style"
      choices={ascentStyleChoices(climbType)}
      value={value}
      onChange={onChange}
    />
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
  const choices: PillChoice<SendStyleChoice>[] = [
    { value: "session", label: "Session", className: PLAIN_CHOICE_CLASSNAME },
    ...(hasPriorSend
      ? [{ value: "repeat" as const, label: "Repeat", className: PLAIN_CHOICE_CLASSNAME }]
      : ascentStyleChoices(climbType)),
  ];
  return (
    <PillRadioGroup
      label={hasPriorSend ? "Session or repeat" : "Session or send"}
      choices={choices}
      value={value}
      onChange={onChange}
    />
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
