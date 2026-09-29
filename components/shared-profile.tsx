import { UserSendLogRow } from "@/components/climb-log-row";
import { SendRows } from "@/components/send-rows";
import { signUpPrompt } from "@/components/sign-up-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/typography";
import type { AreaBreadcrumbs, UserSendRow } from "@/db/queries";

/** The Sends tab for the signed-out holder of a profile link: the latest
 * sends as a member's list draws them, closed by the way to the rest. */
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
        <SendRows>
          {sends.map((send) => (
            // Keys reach the RSC payload; sequential send ids stay out of it.
            <li key={send.climbId}>
              <UserSendLogRow send={send} areaBreadcrumbs={areaBreadcrumbs} />
            </li>
          ))}
        </SendRows>
      )}
      {signUpPrompt({ ownerName: owner.name, sendCount, shown: sends.length, next })}
    </div>
  );
}
