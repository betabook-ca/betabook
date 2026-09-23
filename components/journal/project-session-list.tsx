import { CompanionList } from "@/components/journal/companion-list";
import { ClampedComment } from "@/components/ui/clamped-comment";
import type { JournalEntry } from "@/db/queries";
import { formatDate } from "@/lib/format-date";

/** `id` and `companions` are optional because the shared project page renders
 * this same timeline without either: entry ids are sequential and stay out of
 * the payload, and a companion tag names a third party who never agreed to
 * the link. */
type SessionNote = Pick<JournalEntry, "entryDate" | "tags" | "companions" | "body"> & {
  id?: number;
};

export function ProjectSessionList({ sessions }: { sessions: readonly SessionNote[] }) {
  return (
    <ol className="flex flex-col gap-4 border-l border-separator pl-4">
      {sessions.map((entry, index) => (
        <li
          key={entry.id ?? `${entry.entryDate}-${index}`}
          className="relative flex flex-col gap-1"
        >
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
          {entry.body != null && (
            <div className="text-sm leading-relaxed text-foreground">
              <ClampedComment>{entry.body}</ClampedComment>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
