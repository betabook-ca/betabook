import { AuthCallout } from "@/components/auth/auth-callout";
import { ClimbSendListRow } from "@/components/sends/climb-send-list-row";
import { EmptyState } from "@/components/ui/empty-state";
import { RowList } from "@/components/ui/row-list";
import type { ClimbType } from "@/lib/grades";
import type { PublicClimbSend } from "@/lib/public-catalog";

export function PublicClimbSendList({
  type,
  climbName,
  sends,
  next,
}: {
  type: ClimbType;
  climbName: string;
  sends: PublicClimbSend[];
  next: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {sends.length === 0 ? (
        <EmptyState message="No sends yet — this line is waiting for its first ascent." />
      ) : (
        <RowList>
          {sends.map((send, index) => (
            // Public rows carry no send IDs (see getPublicSendsForClimb).
            // oxlint-disable-next-line react/no-array-index-key
            <li key={index}>
              <ClimbSendListRow type={type} climbName={climbName} send={send} />
            </li>
          ))}
        </RowList>
      )}
      <AuthCallout
        next={next}
        description="Sign in to see who climbed this line, read commentary shared with members, and log your own sends."
      />
    </div>
  );
}
