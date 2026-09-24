"use client";

import { Input, Label, TextArea, TextField } from "@heroui/react";

import { DatePickerField } from "@/components/ui/date-picker-field";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { MAX_TRIP_DESCRIPTION, MAX_TRIP_NAME } from "@/lib/trips";

export type TripDraft = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
};

export const EMPTY_TRIP_DRAFT: TripDraft = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
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
}: {
  draft: TripDraft;
  onChange: (draft: TripDraft) => void;
  /** The server's message, shown verbatim rather than re-worded. */
  error?: string | null;
  /** Shown under End date while the range is backwards, so the climber sees it
   * before submitting rather than after a round trip. */
  dateError?: string | null;
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

      <TextField
        className="w-full"
        value={draft.description}
        onChange={(description) => onChange({ ...draft, description })}
        maxLength={MAX_TRIP_DESCRIPTION}
      >
        <Label>Description</Label>
        <TextArea placeholder="Who you went with, how it went…" rows={4} />
      </TextField>

      {/* Said where the climber is looking, not at the top of a scrolled
       * dialog: this sits directly above the footer button they just pressed. */}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
