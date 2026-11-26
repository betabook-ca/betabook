"use client";

import { localToday } from "@/lib/format-date";
import {
  createJournalEntry,
  createUndatedSend,
  updateJournalEntry,
} from "@/spa/lib/actions-client";

import { JournalEntryFields, type JournalEntryFieldsProps } from "./journal-entry-fields";

type JournalEntryFormProps = Omit<
  JournalEntryFieldsProps,
  "today" | "onSave" | "companionFetcher"
> & { onSave?: JournalEntryFieldsProps["onSave"] };

export function JournalEntryForm(props: JournalEntryFormProps) {
  return (
    <JournalEntryFields
      {...props}
      today={localToday()}
      onSave={
        props.onSave ??
        ((formData, undated) =>
          props.existingEntry
            ? updateJournalEntry(props.existingEntry.id, formData)
            : undated
              ? createUndatedSend(formData)
              : createJournalEntry(formData))
      }
    />
  );
}
