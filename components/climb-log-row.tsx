import type { ReactNode } from "react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { JournalEntryLayout } from "@/components/journal/journal-entry-layout";
import type { AreaBreadcrumbs } from "@/db/queries";
import { climbHref } from "@/lib/slug";

export function ClimbLogRow({
  climb,
  areaBreadcrumbs,
  grade,
  status,
  date,
  tags,
  comment,
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
    />
  );
}
