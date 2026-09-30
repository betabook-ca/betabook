"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Plus, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { ASCENT_STYLE_CHIP_CLASSNAME, ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { SendVideoThumbnail, WatchElsewhereLink } from "@/components/send-video";
import { choicePillClass } from "@/components/ui/choice-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { FieldFeedback, FieldHeader } from "@/components/ui/field-support";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { OptionSelect } from "@/components/ui/option-select";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import {
  MAX_SEND_VIDEOS,
  parseSendVideoLink,
  sendVideoLabel,
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

function LinkedVideoPreview({ video }: { video: SendVideo }) {
  return (
    <div className="flex items-center gap-3">
      <span className="block aspect-video w-24 shrink-0 overflow-hidden rounded-md border border-separator">
        <SendVideoThumbnail video={video} size="sm" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="font-medium text-foreground">{sendVideoLabel(video)} linked</span>
        <WatchElsewhereLink video={video} />
      </div>
    </div>
  );
}

type VideoRow = { id: number; value: string; touched: boolean };

const NO_LINKS: readonly string[] = [];

/** Puts a video list on a send form: the `videosChanged` marker, so the
 * server knows the list was sent even when it's empty, then each link. */
export function appendVideoFields(formData: FormData, links: readonly string[]) {
  formData.set("videosChanged", "true");
  for (const link of links) {
    if (link.trim()) formData.append("video", link);
  }
}

/** One link in the list: its input, the reason it can't be saved once the
 * climber leaves it (a half-pasted link isn't an error yet), and a preview
 * as soon as it reads as a video. */
function VideoLinkRow({
  row,
  position,
  showError,
  removable,
  onChange,
  onBlur,
  onRemove,
}: {
  row: VideoRow;
  position: number;
  showError: boolean;
  removable: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onRemove: () => void;
}) {
  const parsed = row.value.trim() ? parseSendVideoLink(row.value) : null;
  const error = (row.touched || showError) && parsed && !parsed.ok ? parsed.error : null;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <TextField
          aria-label={`Video link ${position}`}
          value={row.value}
          onChange={onChange}
          onBlur={onBlur}
          isInvalid={error !== null}
          className="min-w-0 flex-1"
        >
          {/* Not type="url": the browser would refuse a pasted link without
           * its scheme ("youtu.be/…"), which the parser reads fine. */}
          <Input
            inputMode="url"
            autoComplete="off"
            placeholder="Paste a YouTube or Instagram link"
          />
          <FieldFeedback error={error} className="text-xs" />
        </TextField>
        {removable && (
          <Button
            isIconOnly
            variant="ghost"
            aria-label={`Remove video link ${position}`}
            onPress={onRemove}
            className="shrink-0"
          >
            <X aria-hidden className="size-4" />
          </Button>
        )}
      </div>
      {parsed?.ok && <LinkedVideoPreview video={parsed.video} />}
    </li>
  );
}

/** The send's video links, up to MAX_SEND_VIDEOS, checked with the same
 * parser the server uses and each previewed as soon as it reads as a video,
 * so the climber can see which clips they linked before saving. Holds its
 * own rows (stable keys for adding and removing) and reports the links in
 * order through `onChange`. */
export function SendVideosField({
  initialLinks = NO_LINKS,
  onChange,
  checked = false,
}: {
  initialLinks?: readonly string[];
  onChange: (links: string[]) => void;
  /** Set once a save was refused over a link, so every field says why even
   * if it was never left (Enter submits straight from it). */
  checked?: boolean;
}) {
  const labelId = useId();
  const [rows, setRows] = useState<VideoRow[]>(() =>
    (initialLinks.length ? initialLinks : [""]).map((value, id) => ({ id, value, touched: false })),
  );
  // A new row's key: never one a removed row had while it was on screen.
  const newRow = (): VideoRow => ({
    id: Math.max(-1, ...rows.map((row) => row.id)) + 1,
    value: "",
    touched: false,
  });

  function update(next: VideoRow[]) {
    setRows(next);
    onChange(next.map((row) => row.value));
  }

  const last = rows.at(-1);
  const canAdd = rows.length < MAX_SEND_VIDEOS && last !== undefined && last.value.trim() !== "";
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <FieldHeader>
        <Label id={labelId} elementType="span">
          Videos
        </Label>
        <HelpTooltip label="About send videos">
          Plays with your notes, for your Send commentary audience. The videos stay on YouTube or
          Instagram, as public as they are there.
        </HelpTooltip>
      </FieldHeader>
      <ul role="list" className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <VideoLinkRow
            key={row.id}
            row={row}
            position={index + 1}
            showError={checked}
            // The last empty field stays: it's where the next link goes.
            removable={rows.length > 1 || row.value !== ""}
            onChange={(value) =>
              update(rows.map((other) => (other.id === row.id ? { ...other, value } : other)))
            }
            onBlur={() =>
              setRows(
                rows.map((other) => (other.id === row.id ? { ...other, touched: true } : other)),
              )
            }
            onRemove={() => {
              const rest = rows.filter((other) => other.id !== row.id);
              update(rest.length ? rest : [newRow()]);
            }}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-muted">
          YouTube videos and Shorts, Instagram reels and posts — up to {MAX_SEND_VIDEOS}.
        </span>
        {canAdd && (
          <Button size="sm" variant="ghost" onPress={() => update([...rows, newRow()])}>
            <Plus aria-hidden className="size-4" />
            Add another video
          </Button>
        )}
      </div>
    </div>
  );
}
