"use client";

import { Input, Label, TextArea, TextField } from "@heroui/react";

import { CompanionPicker } from "@/components/journal/companion-picker";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import type { CompanionOption } from "@/lib/journal-companions";
import { MAX_TRIP_DESCRIPTION, MAX_TRIP_NAME } from "@/lib/trips";

export type TripDraft = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  companions: CompanionOption[];
};

export const EMPTY_TRIP_DRAFT: TripDraft = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  companions: [],
};

/** The fields of a trip, with no submit button of its own: the dialog around
 * it owns the footer, so the primary action stays above a phone keyboard
 * instead of below the fold.
 *
 * Both dates are required and neither has a maximum. A trip is often booked
 * before it is climbed, so capping the picker at today — the right choice for
 * logging an ascent — would make the common case impossible here. */
export function TripForm({
  draft,
  onChange,
  error,
  dateError,
  editing = false,
  disabled = false,
  companionFetcher,
}: {
  draft: TripDraft;
  onChange: (draft: TripDraft) => void;
  /** The server's message, shown verbatim rather than re-worded. */
  error?: string | null;
  /** Shown under End date while the range is backwards, so the climber sees it
   * before submitting rather than after a round trip. */
  dateError?: string | null;
  /** An existing trip, whose tags a changed selection replaces. */
  editing?: boolean;
  disabled?: boolean;
  /** Seam for stories and tests; production looks friends up over the API. */
  companionFetcher?: LookupFetcher<CompanionOption>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        className={FIELD_WIDTH_CLASS.long}
        value={draft.name}
        onChange={(name) => onChange({ ...draft, name })}
        maxLength={MAX_TRIP_NAME}
        isRequired
      >
        <Label>Name</Label>
        <Input placeholder="Bishop, March 2026" />
      </TextField>

      <div className="flex flex-wrap gap-4">
        <DatePickerField
          label="Start date"
          value={draft.startDate}
          onChange={(startDate) => onChange({ ...draft, startDate })}
        />
        <DatePickerField
          label="End date"
          value={draft.endDate}
          onChange={(endDate) => onChange({ ...draft, endDate })}
          error={dateError}
        />
      </div>

      <CompanionPicker
        value={draft.companions}
        onChange={(companions) => onChange({ ...draft, companions })}
        editing={editing}
        disabled={disabled}
        fetcher={companionFetcher}
        help="Anyone who can read your journal sees who you tagged. Tagging doesn’t add the trip to their logbook."
      />

      <TextField
        className="w-full"
        value={draft.description}
        onChange={(description) => onChange({ ...draft, description })}
        maxLength={MAX_TRIP_DESCRIPTION}
      >
        <Label>Description</Label>
        <TextArea placeholder="A line about the trip" rows={2} />
      </TextField>

      {/* Said where the climber is looking, not at the top of a scrolled
       * dialog: this sits directly above the footer button they just pressed. */}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
