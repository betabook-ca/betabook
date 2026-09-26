"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import { useState, useTransition } from "react";

import { updateSend } from "@/actions";
import { CompanionPicker } from "@/components/journal/companion-picker";
import { TagInput } from "@/components/journal/tag-input";
import {
  AscentStylePicker,
  FormSection,
  GradeFeelField,
  SuggestedGradeField,
} from "@/components/send-fields";
import { SURFACE_CARD_CLASS } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { FieldHeader } from "@/components/ui/field-support";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InlineAlert } from "@/components/ui/inline-alert";
import { RatingField } from "@/components/ui/rating-field";
import type { EditableSend, JournalEntry, SendableClimb } from "@/db/queries";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import { latestLoggableDate } from "@/lib/broken-climbs";
import { localToday } from "@/lib/format-date";
import type { CompanionOption } from "@/lib/journal-companions";
import { MAX_COMMENT_LENGTH, type AscentStyle, type GradeFeel } from "@/lib/sends";

type SendFormProps = {
  climb: SendableClimb;
  existingSend: EditableSend;
  existingEntry?: Pick<JournalEntry, "id" | "tags" | "companions"> | null;
  onSave?: (id: number, formData: FormData) => Promise<ActionResult>;
  companionFetcher?: LookupFetcher<CompanionOption>;
  onDone?: () => void;
};

export function SendForm({
  climb,
  existingSend,
  existingEntry,
  onSave = updateSend,
  companionFetcher,
  onDone,
}: SendFormProps) {
  const today = localToday();

  const [ascentStyle, setAscentStyle] = useState<AscentStyle>(existingSend.ascentStyle);
  const [dateSent, setDateSent] = useState(existingSend.dateSent ?? "");
  const [comment, setComment] = useState(existingSend.comment ?? "");
  const [rating, setRating] = useState<number | null>(existingSend.rating);
  const [suggestedGrade, setSuggestedGrade] = useState(
    String(existingSend.suggestedGrade ?? climb.grade ?? ""),
  );
  const [gradeFeel, setGradeFeel] = useState<GradeFeel>(existingSend.gradeFeel);
  const [tags, setTags] = useState(existingEntry?.tags ?? []);
  const [companions, setCompanions] = useState<CompanionOption[]>(existingEntry?.companions ?? []);
  const [companionsChanged, setCompanionsChanged] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(tags.length > 0 || companions.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!dateSent && (existingEntry || companions.length || tags.length)) {
      setError("Add a date to keep journal details.");
      return;
    }

    const formData = new FormData();
    formData.set("ascentStyle", ascentStyle);
    formData.set("dateSent", dateSent);
    formData.set("comment", comment);
    formData.set("rating", rating == null ? "" : String(rating));
    formData.set("suggestedGrade", suggestedGrade);
    formData.set("gradeFeel", gradeFeel);

    if (existingEntry !== undefined)
      formData.set("journalEntryId", String(existingEntry?.id ?? ""));
    if (dateSent) {
      formData.set("tagsChanged", "true");
      for (const tag of tags) formData.append("tag", tag);
    }
    if (companionsChanged) {
      formData.set("companionsChanged", "true");
      for (const friend of companions) formData.append("companion", friend.id);
    }

    startTransition(async () => {
      try {
        const result = await onSave(existingSend.id, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`${SURFACE_CARD_CLASS} gap-6`}>
      <FormSection label="Ascent">
        <AscentStylePicker climbType={climb.type} value={ascentStyle} onChange={setAscentStyle} />

        <DatePickerField
          label="Date sent"
          value={dateSent}
          max={latestLoggableDate(climb, today)}
          description={
            climb.brokenOn
              ? `This climb broke on ${climb.brokenOn}; only earlier dates can be logged.`
              : undefined
          }
          onChange={setDateSent}
          // A broken climb can't take an undated send (it can't be shown to
          // predate the break), so the "I don't know" control is withheld.
          onUnknownChange={
            existingEntry || climb.brokenOn
              ? undefined
              : (unknown) => setDateSent(unknown ? "" : (existingSend.dateSent ?? today))
          }
        />
      </FormSection>

      <FormSection label="Your opinion">
        <div className="grid gap-4 sm:grid-cols-2">
          <RatingField value={rating} onValueChange={setRating} />
          <SuggestedGradeField
            climbType={climb.type}
            value={suggestedGrade}
            onChange={setSuggestedGrade}
          />
        </div>

        <GradeFeelField value={gradeFeel} onChange={setGradeFeel} />
      </FormSection>

      <FormSection label="Send commentary">
        <TextField value={comment} onChange={setComment}>
          <FieldHeader
            usage={{ used: comment.length, limit: MAX_COMMENT_LENGTH, unit: "characters" }}
          >
            <Label>Notes</Label>
            <HelpTooltip label="About Send commentary">
              Uses your Send commentary audience wherever this note appears.
            </HelpTooltip>
          </FieldHeader>
          <TextArea maxLength={MAX_COMMENT_LENGTH} placeholder="How'd it go?" />
        </TextField>
      </FormSection>

      {dateSent ? (
        <DetailsDisclosure
          title="Add details"
          isExpanded={detailsExpanded}
          onExpandedChange={setDetailsExpanded}
        >
          <div className="flex flex-wrap items-start gap-4">
            <CompanionPicker
              value={companions}
              onChange={(value) => {
                setCompanions(value);
                setCompanionsChanged(true);
              }}
              disabled={pending}
              editing={!!existingEntry}
              fetcher={companionFetcher}
            />
            <TagInput value={tags} onChange={setTags} />
          </div>
          <p className="text-xs text-muted">
            Tags and tagged friends follow your journal audience.
          </p>
        </DetailsDisclosure>
      ) : (
        <p className="text-sm text-muted">
          Add a date to include this send in your journal with tags and friends.
        </p>
      )}
      {existingEntry && (
        <p className="text-sm text-muted">
          Changes update your send and its original journal entry together.
        </p>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}

      <Button type="submit" isDisabled={pending} fullWidth>
        Save changes
      </Button>
    </form>
  );
}
