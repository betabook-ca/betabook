"use client";

import { Button } from "@heroui/react";
import { clsx } from "clsx";
import { CirclePlus } from "lucide-react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ProjectSessionNotes } from "@/components/journal/project-session-notes";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Grade } from "@/components/ui/grade";
import type { JournalEntry, OpenProject } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { daysBetween, describeDaysAgo, formatDate } from "@/lib/format-date";
import { formatGrade } from "@/lib/grades";
import { climbHref } from "@/lib/slug";

/** An open project with the sessions the server preloaded for it. */
export type ProjectWithSessions = OpenProject & { sessions: JournalEntry[] };

type ProjectCardProps = {
  project: ProjectWithSessions;
  userId: string;
  today: string | null;
  onLogSession: () => void;
};

export function ProjectCard({ project, userId, today, onLogSession }: ProjectCardProps) {
  const daysSince = today == null ? null : daysBetween(project.lastSession, today);

  return (
    <article className={clsx(cardClass("sm", "bordered"), "flex flex-col gap-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">
            <AppLink href={climbHref(project.climbId, project.climbName)}>
              {project.climbName}
            </AppLink>
          </h3>
          <AreaBreadcrumb areaId={project.areaId} areaName={project.areaName} ancestors={[]} />
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

      <ProjectSessionNotes
        userId={userId}
        climbId={project.climbId}
        sessionCount={project.sessionCount}
        initialSessions={project.sessions}
      />

      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 self-start"
        aria-label={`Log a session on ${project.climbName}`}
        onPress={onLogSession}
      >
        <CirclePlus className="size-4" />
        Log session
      </Button>
    </article>
  );
}

function Separator() {
  return <span aria-hidden>·</span>;
}
