"use client";

import { Button, Label, TextArea, TextField, type UseOverlayStateReturn } from "@heroui/react";
import { X } from "lucide-react";
import { useState } from "react";

import { CompanionPicker } from "@/components/journal/companion-picker";
import { TagInput } from "@/components/journal/tag-input";
import {
  appendVideoFields,
  GradeFeelField,
  SendStylePicker,
  SendVideosField,
  SuggestedGradeField,
  type SendStyleChoice,
} from "@/components/send-fields";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { FieldHeader } from "@/components/ui/field-support";
import { Grade } from "@/components/ui/grade";
import { GradeLabel } from "@/components/ui/grade-label";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InlineAlert } from "@/components/ui/inline-alert";
import { RatingField } from "@/components/ui/rating-field";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { ClimbWithAreaName, SendableClimb } from "@/db/queries";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import { MAX_JOURNAL_BODY_LENGTH, MAX_JOURNAL_TAGS } from "@/lib/journal";
import type { CompanionOption } from "@/lib/journal-companions";
import { sendVideoLinksError } from "@/lib/send-video";
import { ASCENT_STYLE_LABELS, type GradeFeel } from "@/lib/sends";

/** A climb in a day. One carried over from a climb page's form has no area
 * name to show. */
type DayLogClimb = SendableClimb & { name: string; areaName?: string };

/** One climb queued in a day: everything its single-entry form would hold
 * except the date, which belongs to the day. Its tags and friends are its own:
 * copied from the day's when it was added, and changed only in its dialog. */
export type DayLogRow = {
  climb: DayLogClimb;
  hasPriorSend: boolean;
  choice: SendStyleChoice;
  body: string;
  tags: string[];
  companions: CompanionOption[];
  rating: number | null;
  suggestedGrade: string;
  gradeFeel: GradeFeel;
  videos: string[];
};

/** An outdoor session's form handed over by Log additional climbs: its date,
 * friends and tags become the day's, and its climb the day's first. */
export type DaySeed = {
  entryDate: string;
  companions: CompanionOption[];
  tags: string[];
  row: DayLogRow;
};

export function newDayLogRow(
  climb: ClimbWithAreaName,
  hasPriorSend: boolean,
  dayTags: readonly string[],
  dayCompanions: readonly CompanionOption[] = [],
): DayLogRow {
  return {
    climb,
    hasPriorSend,
    choice: "session",
    body: "",
    tags: [...dayTags],
    companions: [...dayCompanions],
    rating: null,
    suggestedGrade: String(climb.grade ?? ""),
    gradeFeel: "solid",
    videos: [],
  };
}

/** A first ascent: only it carries a style, rating, grade and videos. */
function isDayLogAscent(row: DayLogRow): boolean {
  return row.choice !== "session" && row.choice !== "repeat" && !row.hasPriorSend;
}

/** Whether the climb broke on or before the day, so it can't be logged on it. */
export function brokeBy(row: DayLogRow, entryDate: string): boolean {
  return row.climb.brokenOn !== null && entryDate !== "" && entryDate >= row.climb.brokenOn;
}

function hasTooManyTags(row: DayLogRow): boolean {
  return row.tags.length > MAX_JOURNAL_TAGS;
}

function tooManyTagsMessage(row: DayLogRow) {
  return `${row.tags.length} tags — the limit is ${MAX_JOURNAL_TAGS}.`;
}

/** The fields the single-climb form would post for this climb, less the date
 * and friends. */
export function dayLogRowForm(row: DayLogRow): FormData {
  const form = new FormData();
  form.set("climbId", String(row.climb.id));
  form.set("body", row.body);
  if (row.choice !== "session") form.set("sent", "true");
  for (const tag of row.tags) form.append("tag", tag);
  form.set("companionsChanged", "true");
  for (const friend of row.companions) form.append("companion", friend.id);
  if (isDayLogAscent(row)) {
    form.set("ascentStyle", row.choice);
    form.set("rating", row.rating == null ? "" : String(row.rating));
    form.set("suggestedGrade", row.suggestedGrade);
    form.set("gradeFeel", row.gradeFeel);
    appendVideoFields(form, row.videos);
  }
  return form;
}

const STYLE_LABELS: Record<SendStyleChoice, string> = {
  session: "Session",
  repeat: "Repeat",
  ...ASCENT_STYLE_LABELS,
};

function ClimbHeading({ climb }: { climb: DayLogClimb }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {climb.areaName && <span className="text-xs text-muted">{climb.areaName}</span>}
      <DisciplineChip type={climb.type} />
      <Grade>
        <GradeLabel type={climb.type} grade={climb.grade} />
      </Grade>
    </div>
  );
}

/** A queued climb as one line of the day, with what it will save. Its fields
 * are edited in DayLogEntryDialog. */
export function DayLogEntrySummary({
  row,
  entryDate,
  disabled,
  onEdit,
  onRemove,
}: {
  row: DayLogRow;
  entryDate: string;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { climb } = row;
  const videos = isDayLogAscent(row) ? row.videos.filter((link) => link.trim()).length : 0;
  const details = [
    STYLE_LABELS[row.choice],
    ...row.tags.map((tag) => `#${tag}`),
    ...(videos ? [`${videos} ${videos === 1 ? "video" : "videos"}`] : []),
  ];

  return (
    // A border rather than a filled card, which `border-separator` all but
    // loses in dark mode.
    <li
      aria-label={climb.name}
      className="flex flex-col gap-2 rounded-panel border border-border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-foreground">{climb.name}</p>
          <ClimbHeading climb={climb} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-label={`Edit ${climb.name}`}
            isDisabled={disabled}
            onPress={onEdit}
          >
            Edit
          </Button>
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
      <p className="text-sm text-foreground">{details.join(" · ")}</p>
      {row.companions.length > 0 && (
        <p className="text-sm text-muted">
          {`With ${row.companions.map((friend) => friend.name).join(", ")}`}
        </p>
      )}
      {row.body && <p className="line-clamp-2 text-sm text-muted">{row.body}</p>}
      {brokeBy(row, entryDate) && (
        <InlineAlert>
          {`This climb broke on ${climb.brokenOn}. Pick an earlier date or remove it.`}
        </InlineAlert>
      )}
    </li>
  );
}

/** One climb's own fields for the day — style, rating and grade for a first
 * ascent, notes, videos, tagged friends and tags — in a dialog over the day
 * form. A new climb's friends and tags were copied from the day's when it was
 * picked; after that they're the climb's own, changed only here. Works on a
 * copy: `onSave` receives it, and closing without saving leaves the day as it
 * was.
 *
 * The dialog itself stays mounted and only its contents restart per opening
 * (`openKey`): remounting the whole modal for each climb left focus on the
 * page body once it closed, rather than on the Edit button that opened it. */
export function DayLogEntryDialog({
  state,
  openKey,
  initial,
  adding,
  companionFetcher,
  entryDate,
  onSave,
  onClose,
}: {
  state: UseOverlayStateReturn;
  /** Changes each time a climb is opened, so the copy starts again from `initial`. */
  openKey: number;
  initial: DayLogRow | null;
  /** A climb just picked, not yet in the day. */
  adding: boolean;
  companionFetcher?: LookupFetcher<CompanionOption>;
  entryDate: string;
  onSave: (row: DayLogRow) => void;
  /** Runs once it has closed, saved or not. */
  onClose?: () => void;
}) {
  const [openedKey, setOpenedKey] = useState(openKey);
  const [draft, setDraft] = useState(initial);
  const [videoChecked, setVideoChecked] = useState(false);
  const [tagError, setTagError] = useState(false);
  if (openKey !== openedKey) {
    setOpenedKey(openKey);
    setDraft(initial);
    setVideoChecked(false);
    setTagError(false);
  }

  function change(patch: Partial<DayLogRow>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function save() {
    if (!draft) return;
    const ascent = isDayLogAscent(draft);
    // Each field shows why; nothing else needs saying.
    const badVideos = ascent && sendVideoLinksError(draft.videos) !== null;
    setVideoChecked(badVideos);
    setTagError(hasTooManyTags(draft));
    if (badVideos || hasTooManyTags(draft)) return;
    onSave(draft);
    state.close();
  }

  const climb = draft?.climb;
  const ascent = draft ? isDayLogAscent(draft) : false;
  return (
    <ResponsiveDialog
      state={state}
      title={climb?.name ?? "Climb"}
      presentation="fullscreen"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button onPress={save}>{adding ? "Add to day" : "Save climb"}</Button>
        </div>
      }
    >
      {draft && climb && (
        // Keyed so fields holding their own state (video rows, a half-typed
        // tag) start again for each climb.
        <div key={openKey} className="flex flex-col gap-4">
          <ClimbHeading climb={climb} />

          <SendStylePicker
            climbType={climb.type}
            value={draft.choice}
            onChange={(choice) => change({ choice })}
            hasPriorSend={draft.hasPriorSend}
          />

          {brokeBy(draft, entryDate) && (
            <InlineAlert>
              {`This climb broke on ${climb.brokenOn}. Pick an earlier date for the day or leave it out.`}
            </InlineAlert>
          )}

          {ascent && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <RatingField value={draft.rating} onValueChange={(rating) => change({ rating })} />
                <SuggestedGradeField
                  climbType={climb.type}
                  value={draft.suggestedGrade}
                  onChange={(suggestedGrade) => change({ suggestedGrade })}
                />
              </div>
              <GradeFeelField
                value={draft.gradeFeel}
                onChange={(gradeFeel) => change({ gradeFeel })}
              />
            </div>
          )}

          <TextField
            className="w-full min-w-0"
            value={draft.body}
            onChange={(body) => change({ body })}
          >
            <FieldHeader
              usage={{
                used: draft.body.length,
                limit: MAX_JOURNAL_BODY_LENGTH,
                unit: "characters",
              }}
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

          {ascent && (
            <SendVideosField
              initialLinks={draft.videos}
              onChange={(videos) => change({ videos })}
              checked={videoChecked}
            />
          )}

          <CompanionPicker
            value={draft.companions}
            onChange={(companions) => change({ companions })}
            fetcher={companionFetcher}
            help="Starts with the day's friends when the climb is added. Anyone who can read this entry sees who you tagged."
          />

          <TagInput
            value={draft.tags}
            onChange={(tags) => {
              setTagError(false);
              change({ tags });
            }}
          />
          {tagError && hasTooManyTags(draft) && (
            <InlineAlert>{`${tooManyTagsMessage(draft)} Remove some to save.`}</InlineAlert>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
