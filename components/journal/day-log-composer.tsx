"use client";

import { Button, useOverlayState } from "@heroui/react";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { createDayEntries } from "@/actions";
import { ClimbPickerDialog } from "@/components/journal/climb-picker-dialog";
import { CompanionPicker } from "@/components/journal/companion-picker";
import {
  brokeBy,
  dayLogRowForm,
  DayLogEntryDialog,
  DayLogEntrySummary,
  hasTooManyTags,
  newDayLogRow,
  type DayLogRow,
  type DaySeed,
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
import {
  appendDayEntry,
  applyDayCompanions,
  applyDayTags,
  MAX_DAY_ENTRIES,
} from "@/lib/journal-day";
import type { SearchFetcher } from "@/lib/search";

const QUEUED = "Already in this day";

/** Why the day can't be saved as it stands, or null. A climb's own dialog
 * refuses bad links and too many tags, but tags added to the whole day
 * afterwards can still push one over. */
function dayError(rows: readonly DayLogRow[], entryDate: string): string | null {
  if (rows.length === 0) return "Add a climb to log this day.";
  if (entryDate === "") return "Add a date to save this day.";
  if (rows.some((row) => brokeBy(row, entryDate))) {
    return "A climb broke before this date. Pick an earlier date or remove it.";
  }
  const overTagged = rows.find(hasTooManyTags);
  return overTagged ? `${overTagged.climb.name} has too many tags. Edit it to remove some.` : null;
}

/** The day as it opens: empty and dated today, or the handed-over session's. */
function startingDay(seed: DaySeed | undefined, today: string) {
  return {
    entryDate: seed?.entryDate ?? today,
    companions: seed?.companions ?? [],
    tags: seed?.tags ?? [],
    rows: seed ? [seed.row] : ([] as DayLogRow[]),
  };
}

function entriesLabel(count: number) {
  return count === 0 ? "Save day" : `Save ${count} ${count === 1 ? "entry" : "entries"}`;
}

/** Logging a day out: the date and tagged friends are set once and every
 * queued climb gets them. Tags can be set for the whole day, and each climb
 * keeps its own style, note, tags and, for a first ascent, videos.
 *
 * Opened from an outdoor session's Log additional climbs, it starts from that
 * session (`seed`): its date, friends and tags, and its climb as the first.
 * The climber sees that setup, and can adjust its friends and tags, before
 * choosing Add climb. */
export function DayLogComposer({
  seed,
  focusOnOpen = false,
  sentClimbIds,
  onBack,
  onDone,
  onPendingChange,
  onSave = createDayEntries,
  climbFetcher,
  companionFetcher,
  today = localToday(),
}: {
  seed?: DaySeed;
  /** Moves focus to the title as the day appears, without scrolling past the
   * setup: the control that opened it has gone with the form it replaced. */
  focusOnOpen?: boolean;
  sentClimbIds?: Set<number>;
  /** Shown as Back above the title when there's somewhere to go back to. */
  onBack?: () => void;
  onDone: () => void;
  onPendingChange?: (pending: boolean) => void;
  onSave?: (formData: FormData) => Promise<ActionResult>;
  climbFetcher?: SearchFetcher;
  companionFetcher?: LookupFetcher<CompanionOption>;
  today?: string;
}) {
  const [start] = useState(() => startingDay(seed, today));
  const [entryDate, setEntryDate] = useState(start.entryDate);
  const [companions, setCompanions] = useState(start.companions);
  const [dayTags, setDayTags] = useState(start.tags);
  const [rows, setRows] = useState(start.rows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const picker = useOverlayState();
  const details = useOverlayState();
  const addClimbRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusOnOpen) titleRef.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);

  /** Returns focus to the day once its dialogs are done with it. A dialog
   * hands focus back to whatever opened it, but a picked result is gone by
   * then. */
  function settleFocus() {
    if (!picker.isOpen && !details.isOpen) addClimbRef.current?.focus();
  }
  // The climb open in its dialog: a new pick (index null) or a queued climb.
  // `key` restarts the dialog's copy from `row` each time it opens.
  const [editing, setEditing] = useState<{
    index: number | null;
    row: DayLogRow;
    key: number;
  } | null>(null);

  function openClimb(index: number | null, row: DayLogRow) {
    setEditing((current) => ({ index, row, key: (current?.key ?? 0) + 1 }));
    details.open();
  }

  function changeDayTags(next: string[]) {
    setRows((current) => applyDayTags(current, dayTags, next));
    setDayTags(next);
  }

  /** The day's friends only pre-fill its climbs, the same way as its tags:
   * each climb saves with its own, edited in its dialog. */
  function changeDayCompanions(next: CompanionOption[]) {
    if (pending) return;
    setRows((current) => applyDayCompanions(current, companions, next));
    setCompanions(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const refused = dayError(rows, entryDate);
    setError(refused);
    if (refused) return;

    const formData = new FormData();
    formData.set("entryDate", entryDate);
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

  const full = rows.length >= MAX_DAY_ENTRIES;
  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <fieldset disabled={pending} className="contents">
          <div ref={titleRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
            {onBack && (
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
            )}
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
              onChange={changeDayCompanions}
              disabled={pending}
              fetcher={companionFetcher}
              help="Added to every climb below. Edit a climb to leave a friend off just that climb. Anyone who can read an entry sees who you tagged."
            />
            <div role="group" aria-label="Day tags" className="flex flex-col gap-1">
              <TagInput label="Tags for every climb" value={dayTags} onChange={changeDayTags} />
              <p className="text-xs text-muted">
                Edit a climb below to leave one off just that climb.
              </p>
            </div>
          </FormSection>

          <FormSection label={`Climbs (${rows.length})`}>
            {rows.length > 0 && (
              <ul role="list" className="flex flex-col gap-2">
                {rows.map((row, index) => (
                  <DayLogEntrySummary
                    key={row.climb.id}
                    row={row}
                    entryDate={entryDate}
                    disabled={pending}
                    onEdit={() => openClimb(index, row)}
                    onRemove={() => setRows((current) => current.filter((_, at) => at !== index))}
                  />
                ))}
              </ul>
            )}
            <Button
              ref={addClimbRef}
              variant="outline"
              className="self-start"
              isDisabled={pending || full}
              onPress={picker.open}
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
      {/* Outside the form: the picker has its own search field, and a dialog
       * portals out of the DOM tree anyway. */}
      <ClimbPickerDialog
        state={picker}
        title="Add a climb"
        sentClimbIds={sentClimbIds}
        disabledClimbIds={new Map(rows.map((row) => [row.climb.id, QUEUED]))}
        fetcher={climbFetcher}
        onPick={(climb, context) =>
          openClimb(null, newDayLogRow(climb, context.sent, dayTags, companions))
        }
        onClose={settleFocus}
      />
      <DayLogEntryDialog
        openKey={editing?.key ?? 0}
        state={details}
        initial={editing?.row ?? null}
        adding={editing?.index === null}
        dayTags={dayTags}
        dayCompanions={companions}
        companionFetcher={companionFetcher}
        entryDate={entryDate}
        onSave={(row) => {
          const index = editing?.index ?? null;
          setRows((current) =>
            index === null ? [...current, row] : current.map((at, i) => (i === index ? row : at)),
          );
          // An error from the last save attempt may have been about this
          // list; the climb changed it, so the next save re-checks.
          setError(null);
        }}
        // A new pick's dialog was opened from a result that's gone now; an
        // edit's goes back to its Edit button.
        onClose={() => {
          if (editing?.index === null) settleFocus();
        }}
      />
    </>
  );
}
