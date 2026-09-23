import { clsx } from "clsx";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import type { PinnedProject } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { daysBetween, describeDaysAgo, formatDate } from "@/lib/format-date";
import { formatGrade } from "@/lib/grades";

type ProjectSummary = Pick<
  PinnedProject,
  | "climbName"
  | "climbType"
  | "climbGrade"
  | "areaName"
  | "sessionCount"
  | "firstSession"
  | "lastSession"
> &
  Partial<Pick<PinnedProject, "pinnedAt" | "sentOn" | "sent">>;

/** Shared project presentation; callers supply links, session data and actions. */
export function ProjectCardLayout({
  project,
  title,
  area,
  today,
  sentLabel,
  children,
  action,
}: {
  project: ProjectSummary;
  title?: ReactNode;
  area?: ReactNode;
  today: string | null;
  /** Replaces the "Sent <date>" text. The shared project page publishes the
   * send by month, matching what the signed-out climb page already shows, so
   * it cannot reuse `sentOn`. */
  sentLabel?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  // A climb can be pinned before it is ever touched, so there may be no last
  // session to measure from and no dates to print at all.
  const daysSince =
    today == null || project.lastSession == null ? null : daysBetween(project.lastSession, today);
  return (
    <article className={clsx(cardClass("sm", "bordered"), "flex flex-col gap-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">
            {title ?? project.climbName}
          </h3>
          {area ?? <span className="text-sm text-muted">{project.areaName}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Grade size="md">{formatGrade(project.climbType, project.climbGrade)}</Grade>
          <DisciplineChip type={project.climbType} />
        </div>
      </div>

      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
        {project.sent && (
          <>
            <span className="font-medium text-success-soft-foreground">
              {sentLabel ?? (project.sentOn ? <>Sent {formatDate(project.sentOn)}</> : "Sent")}
            </span>
            <Separator />
          </>
        )}
        <span className="font-medium text-foreground tabular-nums">
          {project.sessionCount === 0
            ? "No sessions yet"
            : formatCount(project.sessionCount, "session")}
        </span>
        {project.lastSession == null ? (
          project.pinnedAt && (
            <>
              <Separator />
              <span>
                Tracked <time dateTime={project.pinnedAt}>{formatDate(project.pinnedAt)}</time>
              </span>
            </>
          )
        ) : (
          <>
            {/* A project worked on one day only would otherwise print that date
             * twice, once as "Since" and once as "Last". */}
            {project.firstSession !== project.lastSession && project.firstSession != null && (
              <>
                <Separator />
                <span>
                  Since{" "}
                  <time dateTime={project.firstSession}>{formatDate(project.firstSession)}</time>
                </span>
              </>
            )}
            <Separator />
            <span>
              Last <time dateTime={project.lastSession}>{formatDate(project.lastSession)}</time>
            </span>
            {daysSince != null && (
              <>
                <Separator />
                <span>{describeDaysAgo(daysSince)}</span>
              </>
            )}
          </>
        )}
      </p>

      {children}
      {action}
    </article>
  );
}

function Separator() {
  return <span aria-hidden>·</span>;
}
