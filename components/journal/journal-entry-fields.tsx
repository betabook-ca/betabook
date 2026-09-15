"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import { useState, useTransition } from "react";

import { CompanionPicker } from "@/components/journal/companion-picker";
import { JournalEntryDateFields } from "@/components/journal/journal-entry-date-fields";
import { TagInput } from "@/components/journal/tag-input";
import {
  GradeFeelField,
  SendStylePicker,
  SuggestedGradeField,
  type SendStyleChoice,
} from "@/components/send-fields";
import { AppLink } from "@/components/ui/app-link";
import { cardClass, SURFACE_CARD_CLASS } from "@/components/ui/card";
import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { FieldHeader } from "@/components/ui/field-support";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InlineAlert } from "@/components/ui/inline-alert";
import { RatingField } from "@/components/ui/rating-field";
import type { JournalEntry, SendableClimb } from "@/db/queries";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import { MAX_JOURNAL_BODY_LENGTH, type JournalKind } from "@/lib/journal";
import type { CompanionOption } from "@/lib/journal-companions";
import type { AscentStyle, GradeFeel } from "@/lib/sends";

export type JournalEntryFieldsProps = {
  today: string;
  onSave: (formData: FormData, undated: boolean) => Promise<ActionResult>;
  companionFetcher?: LookupFetcher<CompanionOption>;
  kind: JournalKind;
  climb?: (SendableClimb & { name: string }) | null;
  hasPriorSend?: boolean;
  existingEntry?: JournalEntry;
  onDone?: () => void;
  onPendingChange?: (pending: boolean) => void;
  embedded?: boolean;
};

/** A drawer opened from a climb has no chosen-entry strip, so the headline names the climb. */
function describePendingEntry(
  climbName: string,
  sent: boolean,
  hasPriorSend: boolean,
): { headline: string; consequence: string | null } {
  if (!sent) return { headline: `Logging an outdoor session on ${climbName}.`, consequence: null };
  if (hasPriorSend) {
    return {
      headline: `Logging a repeat of ${climbName}.`,
      consequence: "It doesn't change your recorded ascent.",
    };
  }
  return {
    headline: `Logging an ascent of ${climbName}.`,
    consequence: "It counts toward the climb's send total and grade consensus.",
  };
}

// oxlint-disable-next-line complexity
export function JournalEntryFields({
  today,
  embedded = false,
  onSave,
  companionFetcher,
  kind,
  climb,
  hasPriorSend = false,
  existingEntry,
  onDone,
  onPendingChange,
}: JournalEntryFieldsProps) {
  const [entryDate, setEntryDate] = useState(existingEntry?.entryDate ?? today);
  const [choice, setChoice] = useState<SendStyleChoice>("session");
  const [body, setBody] = useState(existingEntry?.body ?? "");
  const [companions, setCompanions] = useState<CompanionOption[]>(existingEntry?.companions ?? []);
  const [companionsChanged, setCompanionsChanged] = useState(false);
  const [tags, setTags] = useState<string[]>(existingEntry?.tags ?? []);

  const [rating, setRating] = useState<number | null>(null);
  const [suggestedGrade, setSuggestedGrade] = useState(String(climb?.grade ?? ""));
  const [gradeFeel, setGradeFeel] = useState<GradeFeel>("solid");

  // Open when the section already holds something to review; otherwise the
  // quick path stays date → sent → notes → save.
  const [detailsExpanded, setDetailsExpanded] = useState(
    (existingEntry?.companions?.length ?? 0) > 0 || (existingEntry?.tags.length ?? 0) > 0,
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sent = existingEntry ? existingEntry.sent : choice !== "session";
  const ascentStyle: AscentStyle =
    choice === "session" || choice === "repeat" ? "redpoint" : choice;
  const isAscent = !existingEntry && sent && climb != null && !hasPriorSend;
  const isUndatedSend = isAscent && entryDate === "";
  const summary =
    climb && !existingEntry ? describePendingEntry(climb.name, sent, hasPriorSend) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (entryDate === "" && !isUndatedSend) {
      setError("Add a date to save this entry.");
      return;
    }
    if (isUndatedSend && companions.length > 0) {
      setError("Add a date to keep tagged friends.");
      setDetailsExpanded(true);
      return;
    }

    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("entryDate", entryDate);
    formData.set("body", body);
    if (climb) formData.set("climbId", String(climb.id));
    if (sent) formData.set("sent", "true");
    if (!isUndatedSend) {
      for (const tag of tags) formData.append("tag", tag);
    }

    if (!existingEntry || companionsChanged) {
      formData.set("companionsChanged", "true");
      for (const friend of companions) formData.append("companion", friend.id);
    }

    if (isAscent) {
      formData.set("ascentStyle", ascentStyle);
      formData.set("rating", rating == null ? "" : String(rating));
      formData.set("suggestedGrade", suggestedGrade);
      formData.set("gradeFeel", gradeFeel);
    }
    if (isUndatedSend) {
      formData.set("dateSent", "");
      formData.set("comment", body);
    }

    onPendingChange?.(true);
    startTransition(async () => {
      try {
        const result = await onSave(formData, isUndatedSend);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      } finally {
        onPendingChange?.(false);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={embedded ? "flex flex-col gap-3" : `${SURFACE_CARD_CLASS} gap-4`}
    >
      {climb && !existingEntry && (
        <SendStylePicker
          climbType={climb.type}
          value={choice}
          onChange={setChoice}
          hasPriorSend={hasPriorSend}
        />
      )}

      <JournalEntryDateFields
        hasClimb={climb != null}
        hasPriorSend={hasPriorSend}
        existingEntry={existingEntry}
        today={today}
        entryDate={entryDate}
        sent={sent}
        onDateChange={setEntryDate}
      />

      {isAscent && climb && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <RatingField value={rating} onValueChange={setRating} />
            <SuggestedGradeField
              climbType={climb.type}
              value={suggestedGrade}
              onChange={setSuggestedGrade}
            />
          </div>
          <GradeFeelField value={gradeFeel} onChange={setGradeFeel} />
        </div>
      )}

      <TextField className="w-full min-w-0" value={body} onChange={setBody}>
        <FieldHeader
          usage={{ used: body.length, limit: MAX_JOURNAL_BODY_LENGTH, unit: "characters" }}
        >
          <Label>Notes</Label>
          {(isAscent || existingEntry?.isSendComment) && (
            <HelpTooltip label="About Send commentary">
              Uses your Send commentary audience wherever this note appears.
            </HelpTooltip>
          )}
        </FieldHeader>
        <TextArea
          maxLength={MAX_JOURNAL_BODY_LENGTH}
          placeholder={
            kind === "training"
              ? "Climbs, drills, sets, weights, how it felt…"
              : "Conditions, beta, how it felt…"
          }
        />
      </TextField>

      <DetailsDisclosure
        title="Add details"
        isExpanded={detailsExpanded}
        onExpandedChange={setDetailsExpanded}
      >
        <div className="flex flex-wrap items-start gap-4">
          <CompanionPicker
            value={companions}
            onChange={(value) => {
              if (pending) return;
              setCompanions(value);
              setCompanionsChanged(true);
            }}
            disabled={pending}
            editing={!!existingEntry}
            fetcher={companionFetcher}
          />
          {!isUndatedSend && <TagInput value={tags} onChange={setTags} />}
        </div>

        <p className="text-xs text-muted">
          Set your Send commentary and Journal and goals audiences in{" "}
          <AppLink href="/account">Account settings</AppLink>.
        </p>
      </DetailsDisclosure>

      {summary && (
        <div className={`flex flex-col gap-1 ${cardClass("sm", "inset")}`}>
          <p className="text-sm font-medium text-foreground">{summary.headline}</p>
          {summary.consequence && <p className="text-sm text-muted">{summary.consequence}</p>}
          {isUndatedSend && (
            <p className="text-sm text-muted">
              Without a date, it stays out of your journal and can't keep tags or tagged friends.
            </p>
          )}
        </div>
      )}

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="flex justify-end border-t border-separator pt-4">
        <Button type="submit" isDisabled={pending}>
          {existingEntry ? "Save changes" : isUndatedSend ? "Save send" : "Save entry"}
        </Button>
      </div>
    </form>
  );
}
