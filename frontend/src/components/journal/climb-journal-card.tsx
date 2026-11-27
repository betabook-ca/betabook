import { CompanionList } from "@/components/journal/companion-list";
import { JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { AppLink } from "@/components/ui/app-link";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { Eyebrow } from "@/components/ui/eyebrow";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";
import type { JournalEntry } from "@/lib/logbook-types";
import { CLIMB_JOURNAL_ENTRY_LIMIT } from "@/lib/page-sizes";

export function ClimbJournalCard({
  userId,
  climbId,
  entries,
}: {
  userId: string;
  climbId: number;
  entries: JournalEntry[];
}) {
  // The page reads CLIMB_JOURNAL_ENTRY_LIMIT entries and shows one fewer, so a
  // full read means there may be more than it fetched.
  const shown = CLIMB_JOURNAL_ENTRY_LIMIT - 1;
  const recentEntries = entries.slice(0, shown);
  const sessionCount =
    entries.length > shown
      ? `${CLIMB_JOURNAL_ENTRY_LIMIT}+ sessions`
      : formatCount(entries.length, "session");

  return (
    <div className="border-l-2 border-date-ink bg-surface-secondary px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Eyebrow>Your journal</Eyebrow>
        {entries.length > 0 && (
          <AppLink href={`/users/${userId}/journal?climbId=${climbId}`} className="text-xs">
            All entries
          </AppLink>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">No sessions logged on this climb yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{sessionCount} logged</p>

          <ul className="flex flex-col gap-3">
            {recentEntries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="inline-flex items-center text-sm font-medium">
                    <JournalEntryStatus
                      kind={entry.isAscent ? "send" : entry.sent ? "repeat" : "session"}
                    />
                  </span>
                  <span className="text-xs text-muted">{formatDate(entry.entryDate)}</span>
                </div>
                <CompanionList companions={entry.companions} />
                {entry.body && (
                  <div className="max-w-prose text-base leading-relaxed text-foreground">
                    <ClampedComment>{entry.body}</ClampedComment>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
