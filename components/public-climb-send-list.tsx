"use client";

import { AscentStyle } from "@/components/ascent-style";
import { AuthCallout } from "@/components/auth-callout";
import { SendGradeCell } from "@/components/send-grade-cell";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { formatDate, formatMonth } from "@/lib/format-date";
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
            <ListRow
              // Send IDs are sequential, so they would date anonymous rows.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              title={send.userName ?? <span className="text-muted">Betabook climber</span>}
              subtitle={sendDateLabel(send)}
              trailing={
                <div className="flex flex-col items-end gap-1 text-sm">
                  <SendGradeCell
                    type={type}
                    grade={send.suggestedGrade}
                    gradeFeel={send.gradeFeel}
                    rating={send.rating}
                  />
                  <AscentStyle type={send.ascentStyle} />
                </div>
              }
              comment={send.comment}
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

function sendDateLabel({ userName, dateSent }: PublicClimbSend) {
  if (!dateSent) return "Date unknown";
  return userName === null ? formatMonth(dateSent) : formatDate(dateSent);
}
