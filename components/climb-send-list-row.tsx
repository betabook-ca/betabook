import type { ReactNode } from "react";

import { AscentStyle } from "@/components/ascent-style";
import { SendGradeCell } from "@/components/send-grade-cell";
import { ListRow } from "@/components/ui/list-row";
import { formatDate, formatMonth } from "@/lib/format-date";
import type { ClimbType } from "@/lib/grades";
import type { PublicClimbSend } from "@/lib/public-catalog";

/** A null `userName` marks an anonymous send, whose date is only "YYYY-MM".
 * Only member rows carry a `userId`, so only they link to a profile. */
export function ClimbSendListRow({
  type,
  send,
  actions,
}: {
  type: ClimbType;
  send: PublicClimbSend & { userId?: string | null };
  actions?: ReactNode;
}) {
  return (
    <ListRow
      title={send.userName ?? <span className="text-muted">Betabook climber</span>}
      href={send.userId ? `/users/${send.userId}` : undefined}
      subtitle={sendDateLabel(send)}
      trailing={
        <div className="flex flex-col items-end gap-1 text-sm">
          {/* The climber's own grade leads: the page's header already
           * carries the posted one. */}
          <SendGradeCell
            type={type}
            grade={send.suggestedGrade}
            gradeFeel={send.gradeFeel}
            rating={send.rating}
          />
          <AscentStyle type={send.ascentStyle} />
        </div>
      }
      actions={actions}
      comment={send.comment}
    />
  );
}

function sendDateLabel({ userName, dateSent }: PublicClimbSend) {
  if (!dateSent) return "Date unknown";
  return userName === null ? formatMonth(dateSent) : formatDate(dateSent);
}
