"use client";

import { Input, Label, TextField } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { ASCENT_STYLE_CHIP_CLASSNAME, ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { SendVideoThumbnail } from "@/components/send-video";
import { choicePillClass } from "@/components/ui/choice-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { FieldFeedback, FieldHeader } from "@/components/ui/field-support";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { OptionSelect } from "@/components/ui/option-select";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import {
  parseSendVideoLink,
  sendVideoLabel,
  sendVideoProviderName,
  sendVideoUrl,
  type SendVideo,
} from "@/lib/send-video";
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

/** Why a video link can't be saved, or null when it can (blank included). */
export function sendVideoFieldError(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = parseSendVideoLink(value);
  return parsed.ok ? null : parsed.error;
}

function LinkedVideoPreview({ video }: { video: SendVideo }) {
  return (
    <div className="flex items-center gap-3">
      <span className="block aspect-video w-24 shrink-0 overflow-hidden rounded-md border border-separator">
        <SendVideoThumbnail video={video} size="sm" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="font-medium text-foreground">{sendVideoLabel(video)} linked</span>
        <a
          href={sendVideoUrl(video)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Check it on {sendVideoProviderName(video)}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </div>
    </div>
  );
}

/** The optional link to a video of the send. Checked with the same parser
 * the server uses, once the climber leaves the field — a half-pasted link
 * isn't an error yet — and previewed as soon as it reads as a video, so they
 * can see which clip they linked before saving. */
export function SendVideoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const parsed = value.trim() ? parseSendVideoLink(value) : null;
  const error = touched && parsed && !parsed.ok ? parsed.error : null;
  return (
    <div className="flex flex-col gap-2">
      <TextField
        value={value}
        onChange={onChange}
        onBlur={() => setTouched(true)}
        isInvalid={error !== null}
      >
        <FieldHeader>
          <Label>Video</Label>
          <HelpTooltip label="About send videos">
            Plays with your notes, for your Send commentary audience. The video stays on YouTube or
            Instagram, as public as it is there.
          </HelpTooltip>
        </FieldHeader>
        {/* Not type="url": the browser would refuse a pasted link without its
         * scheme ("youtu.be/…"), which the parser reads fine. */}
        <Input inputMode="url" autoComplete="off" placeholder="Paste a YouTube or Instagram link" />
        <FieldFeedback
          error={error}
          helper={parsed?.ok ? undefined : "YouTube videos and Shorts, Instagram reels and posts."}
          className="text-xs"
        />
      </TextField>
      {parsed?.ok && <LinkedVideoPreview video={parsed.video} />}
    </div>
  );
}
