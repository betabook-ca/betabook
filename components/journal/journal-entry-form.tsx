"use client";

import { createJournalEntry, createUndatedSend, updateJournalEntry } from "@/actions";

import { JournalEntryFields, type JournalEntryFieldsProps } from "./journal-entry-fields";

type JournalEntryFormProps = Omit<JournalEntryFieldsProps, "today" | "onSave" | "companionFetcher">;

export function JournalEntryForm(props: JournalEntryFormProps) {
  return (
    <JournalEntryFields
      {...props}
      today={new Intl.DateTimeFormat("en-CA").format(new Date())}
      onSave={(formData, undated) =>
        props.existingEntry
          ? updateJournalEntry(props.existingEntry.id, formData)
          : undated
            ? createUndatedSend(formData)
            : createJournalEntry(formData)
      }
    />
  );
}
