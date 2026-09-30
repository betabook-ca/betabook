import type { ReactNode } from "react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { AscentStyle, ascentSummary } from "@/components/ascent-style";
import { JournalEntryLayout } from "@/components/journal/journal-entry-layout";
import { SendGradeCell } from "@/components/send-grade-cell";
import { SendVideoButton } from "@/components/send-video";
import type { AreaBreadcrumbs, UserSendRow } from "@/db/queries";
import { climbHref } from "@/lib/slug";

export function ClimbLogRow({
  climb,
  areaBreadcrumbs,
  grade,
  status,
  date,
  tags,
  comment,
  media,
  actions,
}: {
  climb: {
    id: number;
    name: string;
    areaId: number;
    areaName: string;
  };
  areaBreadcrumbs: AreaBreadcrumbs;
  grade: ReactNode;
  status: ReactNode;
  date: string | null;
  tags?: ReactNode;
  comment?: string | null;
  media?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <JournalEntryLayout
      title={climb.name}
      href={climbHref(climb.id, climb.name)}
      location={
        <AreaBreadcrumb
          areaId={climb.areaId}
          areaName={climb.areaName}
          ancestors={areaBreadcrumbs[climb.areaId] ?? []}
        />
      }
      tags={tags}
      grade={grade}
      status={status}
      date={date}
      actions={actions}
      comment={comment}
      media={media}
    />
  );
}

/** One of a climber's sends as a log row. */
export function UserSendLogRow({
  send,
  areaBreadcrumbs,
  actions,
}: {
  send: UserSendRow;
  areaBreadcrumbs: AreaBreadcrumbs;
  actions?: ReactNode;
}) {
  return (
    <ClimbLogRow
      climb={{
        id: send.climbId,
        name: send.climbName,
        areaId: send.areaId,
        areaName: send.areaName,
      }}
      areaBreadcrumbs={areaBreadcrumbs}
      grade={
        <SendGradeCell
          type={send.climbType}
          grade={send.climbGrade}
          suggestedGrade={send.suggestedGrade}
          gradeFeel={send.gradeFeel}
          rating={send.rating}
        />
      }
      status={<AscentStyle type={send.ascentStyle} />}
      date={send.dateSent}
      actions={actions}
      comment={send.comment}
      media={
        send.videoUrl ? (
          <SendVideoButton
            videoUrl={send.videoUrl}
            title={send.climbName}
            caption={ascentSummary(send.ascentStyle, send.dateSent)}
          />
        ) : undefined
      }
    />
  );
}
