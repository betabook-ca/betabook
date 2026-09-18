"use client";

import { DatePickerField } from "@/components/ui/date-picker-field";
import type { JournalEntry } from "@/db/queries";
import { latestLoggableDate } from "@/lib/broken-climbs";

type JournalEntryDateFieldsProps = {
  hasClimb: boolean;
  hasPriorSend: boolean;
  existingEntry?: Pick<JournalEntry, "sent" | "isAscent">;
  today: string;
  /** The climb's break date, when it has one: caps the picker to the day
   * before and withholds the undated option (see lib/broken-climbs.ts). */
  brokenOn?: string | null;
  /** ISO `YYYY-MM-DD`, or "" once cleared — a send saved without a date. */
  entryDate: string;
  /** Chosen in the owning form's session-or-send picker. */
  sent: boolean;
  disabled?: boolean;
  onDateChange: (value: string) => void;
};

export function JournalEntryDateFields({
  hasClimb,
  hasPriorSend,
  existingEntry,
  today,
  brokenOn = null,
  entryDate,
  sent,
  disabled = false,
  onDateChange,
}: JournalEntryDateFieldsProps) {
  // A broken climb can't take an undated ascent: it can't be shown to predate the break.
  const canMarkUnknown = !existingEntry && hasClimb && sent && !hasPriorSend && !brokenOn;
  const max = latestLoggableDate({ brokenOn }, today);

  return (
    <div className="flex flex-col gap-3">
      <DatePickerField
        label="Date"
        value={entryDate}
        max={max}
        description={
          brokenOn
            ? `This climb broke on ${brokenOn}; only earlier dates can be logged.`
            : undefined
        }
        isReadOnly={existingEntry?.sent}
        isDisabled={disabled}
        onChange={onDateChange}
        // I don't know appears once a send style is chosen on a first ascent,
        // recording it undated. A repeat always needs a date, so it never
        // offers the control.
        onUnknownChange={
          canMarkUnknown ? (unknown) => onDateChange(unknown ? "" : today) : undefined
        }
      />

      {hasClimb && existingEntry?.sent && (
        <p className="text-sm text-muted">
          {existingEntry.isAscent
            ? "To change the ascent date, use Edit send on the climb page."
            : "To change this repeat’s date, delete the entry and log it again."}
        </p>
      )}
    </div>
  );
}
