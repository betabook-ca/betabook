"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import { X } from "lucide-react";

import { TagInput } from "@/components/journal/tag-input";
import {
  appendVideoFields,
  GradeFeelField,
  SendStylePicker,
  SendVideosField,
  SuggestedGradeField,
  type SendStyleChoice,
} from "@/components/send-fields";
import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { FieldHeader } from "@/components/ui/field-support";
import { Grade } from "@/components/ui/grade";
import { GradeLabel } from "@/components/ui/grade-label";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InlineAlert } from "@/components/ui/inline-alert";
import { RatingField } from "@/components/ui/rating-field";
import type { ClimbWithAreaName } from "@/db/queries";
import { MAX_JOURNAL_BODY_LENGTH, MAX_JOURNAL_TAGS } from "@/lib/journal";
import type { DayEntryTags } from "@/lib/journal-day";
import type { GradeFeel } from "@/lib/sends";

/** One climb queued in a day: everything its single-entry form would hold
 * except the date and tagged friends, which belong to the day. */
export type DayLogRow = DayEntryTags & {
  climb: ClimbWithAreaName;
  hasPriorSend: boolean;
  choice: SendStyleChoice;
  body: string;
  rating: number | null;
  suggestedGrade: string;
  gradeFeel: GradeFeel;
  videos: string[];
  /** Set once a save was refused over one of this climb's video links. */
  videoChecked: boolean;
  detailsExpanded: boolean;
};

export function newDayLogRow(
  climb: ClimbWithAreaName,
  hasPriorSend: boolean,
  dayTags: readonly string[],
): DayLogRow {
  return {
    climb,
    hasPriorSend,
    choice: "session",
    body: "",
    tags: [...dayTags],
    declinedDayTags: [],
    rating: null,
    suggestedGrade: String(climb.grade ?? ""),
    gradeFeel: "solid",
    videos: [],
    videoChecked: false,
    detailsExpanded: false,
  };
}

/** A first ascent: only it carries a style, rating, grade and videos. */
export function isDayLogAscent(row: DayLogRow): boolean {
  return row.choice !== "session" && row.choice !== "repeat" && !row.hasPriorSend;
}

/** Whether the climb broke on or before the day, so it can't be logged on it. */
export function brokeBy(row: DayLogRow, entryDate: string): boolean {
  return row.climb.brokenOn !== null && entryDate !== "" && entryDate >= row.climb.brokenOn;
}

export function hasTooManyTags(row: DayLogRow): boolean {
  return row.tags.length > MAX_JOURNAL_TAGS;
}

/** The fields the single-climb form would post for this climb, less the date
 * and friends. */
export function dayLogRowForm(row: DayLogRow): FormData {
  const form = new FormData();
  form.set("climbId", String(row.climb.id));
  form.set("body", row.body);
  if (row.choice !== "session") form.set("sent", "true");
  for (const tag of row.tags) form.append("tag", tag);
  if (isDayLogAscent(row)) {
    form.set("ascentStyle", row.choice);
    form.set("rating", row.rating == null ? "" : String(row.rating));
    form.set("suggestedGrade", row.suggestedGrade);
    form.set("gradeFeel", row.gradeFeel);
    appendVideoFields(form, row.videos);
  }
  return form;
}

export function DayLogEntry({
  row,
  entryDate,
  disabled,
  onChange,
  onTagsChange,
  onRemove,
}: {
  row: DayLogRow;
  entryDate: string;
  disabled: boolean;
  onChange: (patch: Partial<DayLogRow>) => void;
  onTagsChange: (tags: string[]) => void;
  onRemove: () => void;
}) {
  const { climb } = row;
  const ascent = isDayLogAscent(row);

  return (
    // A border rather than a filled card: the fields inside, tag chips most of
    // all, are drawn for the dialog's own surface and vanish on a filled one.
    // `border` rather than `separator`, which all but disappears in dark mode.
    <li
      aria-label={climb.name}
      className="flex flex-col gap-3 rounded-panel border border-border p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{climb.name}</p>
          <p className="text-xs text-muted">{climb.areaName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DisciplineChip type={climb.type} />
          <Grade>
            <GradeLabel type={climb.type} grade={climb.grade} />
          </Grade>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={`Remove ${climb.name}`}
            isDisabled={disabled}
            onPress={onRemove}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      <SendStylePicker
        climbType={climb.type}
        value={row.choice}
        onChange={(choice) => onChange({ choice })}
        hasPriorSend={row.hasPriorSend}
      />

      {brokeBy(row, entryDate) && (
        <InlineAlert>
          {`This climb broke on ${climb.brokenOn}. Pick an earlier date or remove it.`}
        </InlineAlert>
      )}

      {ascent && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <RatingField value={row.rating} onValueChange={(rating) => onChange({ rating })} />
            <SuggestedGradeField
              climbType={climb.type}
              value={row.suggestedGrade}
              onChange={(suggestedGrade) => onChange({ suggestedGrade })}
            />
          </div>
          <GradeFeelField value={row.gradeFeel} onChange={(gradeFeel) => onChange({ gradeFeel })} />
        </div>
      )}

      <TextField
        className="w-full min-w-0"
        value={row.body}
        onChange={(body) => onChange({ body })}
      >
        <FieldHeader
          usage={{ used: row.body.length, limit: MAX_JOURNAL_BODY_LENGTH, unit: "characters" }}
        >
          <Label>Notes</Label>
          {ascent && (
            <HelpTooltip label="About Send commentary">
              Uses your Send commentary audience wherever this note appears.
            </HelpTooltip>
          )}
        </FieldHeader>
        <TextArea
          maxLength={MAX_JOURNAL_BODY_LENGTH}
          placeholder="Conditions, beta, how it felt…"
        />
      </TextField>

      <DetailsDisclosure
        title="Add details"
        isExpanded={row.detailsExpanded}
        onExpandedChange={(detailsExpanded) => onChange({ detailsExpanded })}
      >
        {ascent && (
          <SendVideosField
            initialLinks={row.videos}
            onChange={(videos) => onChange({ videos })}
            checked={row.videoChecked}
          />
        )}
        <TagInput value={row.tags} onChange={onTagsChange} />
        {hasTooManyTags(row) && (
          <InlineAlert>
            {`${row.tags.length} tags — the limit is ${MAX_JOURNAL_TAGS}. Remove some from this climb.`}
          </InlineAlert>
        )}
      </DetailsDisclosure>
    </li>
  );
}
