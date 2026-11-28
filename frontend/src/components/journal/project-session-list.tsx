import { CompanionList } from "@/components/journal/companion-list";
import { RowComment } from "@/components/ui/list-row";
import { formatDate } from "@/lib/format-date";
import type { JournalEntry } from "@/lib/logbook-types";

/** Shared project links omit companions so they do not reveal a third party's name. */
type SessionNote = Pick<JournalEntry, "id" | "entryDate" | "tags" | "body"> &
  Partial<Pick<JournalEntry, "companions">>;

export function ProjectSessionList({ sessions }: { sessions: readonly SessionNote[] }) {
  return (
    <ol className="flex flex-col gap-4 border-l border-separator pl-4">
      {sessions.map((entry) => (
        <li key={entry.id} className="relative flex flex-col gap-1">
          {/* The tick on the timeline rule: -left-[1.3125rem] backs the
           * dot out over the ol's pl-4 and centres it on the 1px rule. */}
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.3125rem] size-2 rounded-full bg-border"
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <time dateTime={entry.entryDate} className="text-sm font-medium text-foreground">
              {formatDate(entry.entryDate)}
            </time>
            {entry.tags.map((tag) => (
              <span key={tag} className="text-xs text-muted">
                #{tag}
              </span>
            ))}
          </div>
          <CompanionList companions={entry.companions} />
          {entry.body != null && <RowComment fullWidth>{entry.body}</RowComment>}
        </li>
      ))}
    </ol>
  );
}
