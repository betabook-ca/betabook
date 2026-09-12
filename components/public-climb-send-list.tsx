"use client";

import { AuthCallout } from "@/components/auth-callout";
import { ClimbSendListRow } from "@/components/climb-send-list-row";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClimbType } from "@/lib/grades";
import type { PublicClimbSend } from "@/lib/public-catalog";

export function PublicClimbSendList({
  type,
  sends,
  next,
}: {
  type: ClimbType;
  sends: PublicClimbSend[];
  next: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {sends.length === 0 ? (
        <EmptyState message="No sends yet — this line is waiting for its first ascent." />
      ) : (
        <div className="flex flex-col divide-y divide-separator">
          {sends.map((send, index) => (
            <ClimbSendListRow
              // Public rows carry no send IDs (see getPublicSendsForClimb).
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              type={type}
              send={send}
            />
          ))}
        </div>
      )}
      <AuthCallout
        next={next}
        description="Sign in to see who climbed this line, read commentary shared with members, and log your own sends."
      />
    </div>
  );
}
