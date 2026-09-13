"use client";

import { DatePickerField } from "@/components/ui/date-picker-field";
import type { JournalEntry } from "@/db/queries";

type JournalEntryDateFieldsProps = {
  hasClimb: boolean;
  hasPriorSend: boolean;
  existingEntry?: Pick<JournalEntry, "sent" | "isAscent">;
  today: string;
  /** ISO `YYYY-MM-DD`, or "" once cleared — a send saved without a date. */
  entryDate: string;
  /** Chosen in the owning form's session-or-send picker. */
  sent: boolean;
  onDateChange: (value: string) => void;
};

export function JournalEntryDateFields({
  hasClimb,
  hasPriorSend,
  existingEntry,
  today,
  entryDate,
  sent,
  onDateChange,
}: JournalEntryDateFieldsProps) {
  const canMarkUnknown = !existingEntry && hasClimb && sent && !hasPriorSend;

  return (
    <div className="flex flex-col gap-3">
      <DatePickerField
        label="Date"
        value={entryDate}
        max={today}
        isReadOnly={existingEntry?.sent}
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
