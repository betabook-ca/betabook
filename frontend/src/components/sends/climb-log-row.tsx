import type { ReactNode } from "react";

import { AreaBreadcrumb } from "@/components/areas/area-breadcrumb";
import { ascentSummary } from "@/components/climbing/ascent-style";
import type { GroupedDateDisplay } from "@/components/journal/dated-logbook-rows";
import { JournalEntryLayout, JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { SendGradeCell } from "@/components/sends/send-grade-cell";
import { sendVideoMedia } from "@/components/sends/send-video-media";
import type { AreaBreadcrumbs } from "@/lib/catalog-types";
import type { UserSendRow } from "@/lib/logbook-types";
import { ASCENT_STYLE_LABELS } from "@/lib/sends";
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
  dateDisplay,
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
  dateDisplay?: GroupedDateDisplay;
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
      dateDisplay={dateDisplay}
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
  dateDisplay,
}: {
  send: UserSendRow;
  areaBreadcrumbs: AreaBreadcrumbs;
  actions?: ReactNode;
  dateDisplay?: GroupedDateDisplay;
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
      status={<JournalEntryStatus kind="send" label={ASCENT_STYLE_LABELS[send.ascentStyle]} />}
      dateDisplay={dateDisplay}
      date={send.dateSent}
      actions={actions}
      comment={send.comment}
      media={sendVideoMedia(
        send.videos,
        send.climbName,
        ascentSummary(send.ascentStyle, send.dateSent),
      )}
    />
  );
}
