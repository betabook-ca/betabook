import type { ReactNode } from "react";

import { ascentSummary } from "@/components/ascent-style";
import { JournalEntryLayout, JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { SendGradeCell } from "@/components/send-grade-cell";
import { sendVideoMedia } from "@/components/send-video-media";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDate, formatMonth } from "@/lib/format-date";
import type { ClimbType } from "@/lib/grades";
import type { PublicClimbSend } from "@/lib/public-catalog";
import { ASCENT_STYLE_LABELS } from "@/lib/sends";

/** A null `userName` marks an anonymous send, whose date is only "YYYY-MM".
 * Only member rows carry a `userId`, so only they link to a profile. */
export function ClimbSendListRow({
  type,
  climbName,
  send,
  actions,
}: {
  type: ClimbType;
  /** Names the video dialog: "Alex on Midnight Lightning". */
  climbName: string;
  send: PublicClimbSend & { userId?: string | null };
  actions?: ReactNode;
}) {
  return (
    <JournalEntryLayout
      leading={<UserAvatar name={send.userName} image={send.userImage} size="sm" />}
      title={send.userName ?? <span className="font-medium text-muted">Betabook climber</span>}
      href={send.userId ? `/users/${send.userId}` : undefined}
      // The climber's own grade leads: the page's header already carries the
      // posted one. A bare "—" beside a name would read as part of it.
      grade={
        send.suggestedGrade == null && send.rating == null ? undefined : (
          <SendGradeCell
            type={type}
            grade={send.suggestedGrade}
            gradeFeel={send.gradeFeel}
            rating={send.rating}
          />
        )
      }
      status={<JournalEntryStatus kind="send" label={ASCENT_STYLE_LABELS[send.ascentStyle]} />}
      location={sendDateLabel(send)}
      date={null}
      actions={actions}
      comment={send.comment}
      media={sendVideoMedia(
        send.videos,
        `${send.userName ?? "Betabook climber"} on ${climbName}`,
        ascentSummary(send.ascentStyle, send.dateSent),
      )}
    />
  );
}

function sendDateLabel({ userName, dateSent }: PublicClimbSend) {
  if (!dateSent) return "Date unknown";
  return userName === null ? formatMonth(dateSent) : formatDate(dateSent);
}
