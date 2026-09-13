import { CompanionList } from "@/components/journal/companion-list";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { JournalEntry } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

export function ClimbJournalCard({
  userId,
  climbId,
  entries,
}: {
  userId: string;
  climbId: number;
  entries: JournalEntry[];
}) {
  const recentEntries = entries.slice(0, 3);
  const sessionCount = entries.length > 3 ? "4+ sessions" : formatCount(entries.length, "session");

  return (
    <div className={cardClass("sm")}>
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
                  <span className="text-sm font-medium text-foreground">
                    {entry.sent ? (entry.isAscent ? "Sent" : "Repeat") : "Session"}
                  </span>
                  <span className="text-xs text-muted">{formatDate(entry.entryDate)}</span>
                </div>
                <CompanionList companions={entry.companions} />
                {entry.body && (
                  <div className="text-sm text-muted">
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
