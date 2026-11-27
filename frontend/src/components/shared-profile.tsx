import { UserSendLogRow } from "@/components/climb-log-row";
import { DatedLogbookRows } from "@/components/journal/dated-logbook-rows";
import { signUpPrompt } from "@/components/sign-up-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaBreadcrumbs } from "@/lib/catalog-types";
import type { UserSendRow } from "@/lib/logbook-types";

/** Sends tab for a signed-out visitor with a share link: the latest sends, then
 * a sign-up prompt. */
export function SharedProfile({
  owner,
  sendCount,
  sends,
  areaBreadcrumbs,
  next,
}: {
  owner: { name: string };
  sendCount: number;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  next: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeading className="sr-only">Sends</SectionHeading>
      {sends.length === 0 ? (
        <EmptyState message={`${owner.name} hasn't logged a send yet.`} />
      ) : (
        <DatedLogbookRows
          items={sends}
          itemKey={(send) => send.climbId}
          dateOf={(send) => send.dateSent}
          renderRow={(send, dateDisplay) => (
            <UserSendLogRow
              send={send}
              dateDisplay={dateDisplay}
              areaBreadcrumbs={areaBreadcrumbs}
            />
          )}
        />
      )}
      {signUpPrompt({ ownerName: owner.name, sendCount, shown: sends.length, next })}
    </div>
  );
}
