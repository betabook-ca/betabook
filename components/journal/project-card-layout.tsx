import { clsx } from "clsx";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import type { OpenProject } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { daysBetween, describeDaysAgo, formatDate } from "@/lib/format-date";
import { formatGrade } from "@/lib/grades";

type ProjectSummary = Pick<
  OpenProject,
  | "climbName"
  | "climbType"
  | "climbGrade"
  | "areaName"
  | "sessionCount"
  | "firstSession"
  | "lastSession"
>;

/** Shared project presentation; callers supply links, session data and actions. */
export function ProjectCardLayout({
  project,
  title,
  area,
  today,
  children,
  action,
}: {
  project: ProjectSummary;
  title?: ReactNode;
  area?: ReactNode;
  today: string | null;
  children: ReactNode;
  action?: ReactNode;
}) {
  const daysSince = today == null ? null : daysBetween(project.lastSession, today);
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
        <span className="font-medium text-foreground tabular-nums">
          {formatCount(project.sessionCount, "session")}
        </span>
        {/* A project worked on one day only would otherwise print that date
         * twice, once as "Since" and once as "Last". */}
        {project.firstSession !== project.lastSession && (
          <>
            <Separator />
            <span>
              Since <time dateTime={project.firstSession}>{formatDate(project.firstSession)}</time>
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
      </p>

      {children}
      {action}
    </article>
  );
}

function Separator() {
  return <span aria-hidden>·</span>;
}
