"use client";

import { Button } from "@heroui/react";
import { ArrowLeft, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { createDayEntries } from "@/actions";
import { ClimbPicker } from "@/components/climb-picker";
import { CompanionPicker } from "@/components/journal/companion-picker";
import {
  brokeBy,
  dayLogRowForm,
  DayLogEntry,
  hasTooManyTags,
  isDayLogAscent,
  newDayLogRow,
  type DayLogRow,
} from "@/components/journal/day-log-entry";
import { JournalEntryDateFields } from "@/components/journal/journal-entry-date-fields";
import { TagInput } from "@/components/journal/tag-input";
import { FormSection } from "@/components/send-fields";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import { localToday } from "@/lib/format-date";
import type { CompanionOption } from "@/lib/journal-companions";
import { appendDayEntry, applyDayTags, MAX_DAY_ENTRIES, retagDayEntry } from "@/lib/journal-day";
import type { SearchFetcher } from "@/lib/search";
import { sendVideoLinksError } from "@/lib/send-video";

const QUEUED = "Already in this day";

function entriesLabel(count: number) {
  return count === 0 ? "Save day" : `Save ${count} ${count === 1 ? "entry" : "entries"}`;
}

/** Logging a day out: the date and tagged friends are set once and every
 * queued climb gets them. Tags can be set for the whole day, and each climb
 * keeps its own style, note, tags and, for a first ascent, videos. */
export function DayLogComposer({
  sentClimbIds,
  onBack,
  onDone,
  onPendingChange,
  onBrowseChange,
  onSave = createDayEntries,
  climbFetcher,
  companionFetcher,
  today = localToday(),
}: {
  sentClimbIds?: Set<number>;
  onBack: () => void;
  onDone: () => void;
  onPendingChange?: (pending: boolean) => void;
  onBrowseChange?: (browsing: boolean) => void;
  onSave?: (formData: FormData) => Promise<ActionResult>;
  climbFetcher?: SearchFetcher;
  companionFetcher?: LookupFetcher<CompanionOption>;
  today?: string;
}) {
  const [entryDate, setEntryDate] = useState(today);
  const [companions, setCompanions] = useState<CompanionOption[]>([]);
  const [dayTags, setDayTags] = useState<string[]>([]);
  const [rows, setRows] = useState<DayLogRow[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function browse(value: boolean) {
    setBrowsing(value);
    onBrowseChange?.(value);
  }

  function updateRow(index: number, update: (row: DayLogRow) => DayLogRow) {
    setRows((current) => current.map((row, at) => (at === index ? update(row) : row)));
  }

  function changeDayTags(next: string[]) {
    setRows((current) => applyDayTags(current, dayTags, next));
    setDayTags(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (rows.length === 0) {
      setError("Add a climb to log this day.");
      return;
    }
    if (entryDate === "") {
      setError("Add a date to save this day.");
      return;
    }
    if (rows.some((row) => brokeBy(row, entryDate))) {
      setError("A climb broke before this date. Pick an earlier date or remove it.");
      return;
    }
    // Each climb's fields, opened if need be, show the reason.
    const blocked = rows.map(
      (row) => hasTooManyTags(row) || (isDayLogAscent(row) && !!sendVideoLinksError(row.videos)),
    );
    if (blocked.some(Boolean)) {
      setRows((current) =>
        current.map((row, index) =>
          blocked[index] ? { ...row, videoChecked: true, detailsExpanded: true } : row,
        ),
      );
      return;
    }

    const formData = new FormData();
    formData.set("entryDate", entryDate);
    formData.set("companionsChanged", "true");
    for (const friend of companions) formData.append("companion", friend.id);
    for (const [index, row] of rows.entries()) {
      appendDayEntry(formData, index, dayLogRowForm(row));
    }

    onPendingChange?.(true);
    startTransition(async () => {
      try {
        const result = await onSave(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone();
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      } finally {
        onPendingChange?.(false);
      }
    });
  }

  if (browsing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="Back to the day"
            onPress={() => browse(false)}
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Button>
          <PageTitle size="sm" className="text-foreground">
            Add a climb
          </PageTitle>
        </div>
        <ClimbPicker
          showFilters={false}
          allowSentClimbs
          sentClimbIds={sentClimbIds}
          fetcher={climbFetcher}
          disabledClimbIds={new Map(rows.map((row) => [row.climb.id, QUEUED]))}
          onPick={(climb, context) => {
            setRows((current) => [...current, newDayLogRow(climb, context.sent, dayTags)]);
            browse(false);
          }}
        />
      </div>
    );
  }

  const full = rows.length >= MAX_DAY_ENTRIES;
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset disabled={pending} className="contents">
        <div className="flex flex-col gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onPress={onBack}
            isDisabled={pending}
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Button>
          <PageTitle size="sm" className="text-foreground">
            Log a day
          </PageTitle>
        </div>

        <FormSection label="The day">
          <JournalEntryDateFields
            hasClimb={false}
            hasPriorSend={false}
            today={today}
            entryDate={entryDate}
            sent={false}
            disabled={pending}
            onDateChange={setEntryDate}
          />
          <CompanionPicker
            value={companions}
            onChange={(value) => {
              if (!pending) setCompanions(value);
            }}
            disabled={pending}
            fetcher={companionFetcher}
            help="Every climb in this day is tagged with these friends. Anyone who can read an entry sees who you tagged."
          />
          <div role="group" aria-label="Day tags" className="flex flex-col gap-1">
            <TagInput label="Tags for every climb" value={dayTags} onChange={changeDayTags} />
            <p className="text-xs text-muted">
              Take one off a climb below to leave it off just that climb.
            </p>
          </div>
        </FormSection>

        <FormSection label={`Climbs (${rows.length})`}>
          {rows.length > 0 && (
            <ul role="list" className="flex flex-col gap-3">
              {rows.map((row, index) => (
                <DayLogEntry
                  key={row.climb.id}
                  row={row}
                  entryDate={entryDate}
                  disabled={pending}
                  onChange={(patch) => updateRow(index, (current) => ({ ...current, ...patch }))}
                  onTagsChange={(tags) =>
                    updateRow(index, (current) => retagDayEntry(current, dayTags, tags))
                  }
                  onRemove={() => setRows((current) => current.filter((_, at) => at !== index))}
                />
              ))}
            </ul>
          )}
          <Button
            variant="outline"
            className="self-start"
            isDisabled={pending || full}
            onPress={() => browse(true)}
          >
            <Plus aria-hidden className="size-4" />
            Add climb
          </Button>
          {full && (
            <p className="text-xs text-muted">{`A day holds up to ${MAX_DAY_ENTRIES} climbs.`}</p>
          )}
        </FormSection>

        {error && <InlineAlert>{error}</InlineAlert>}

        <div className="flex justify-end border-t border-separator pt-4">
          <Button type="submit" isDisabled={pending}>
            {entriesLabel(rows.length)}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
