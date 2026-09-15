"use client";

import { Button } from "@heroui/react";
import { CirclePlus } from "lucide-react";

import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ProjectCardLayout } from "@/components/journal/project-card-layout";
import { ProjectSessionNotes } from "@/components/journal/project-session-notes";
import { AppLink } from "@/components/ui/app-link";
import type { JournalEntry, OpenProject } from "@/db/queries";
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
  return (
    <ProjectCardLayout
      project={project}
      today={today}
      title={
        <AppLink href={climbHref(project.climbId, project.climbName)}>{project.climbName}</AppLink>
      }
      area={<AreaBreadcrumb areaId={project.areaId} areaName={project.areaName} ancestors={[]} />}
      action={
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
      }
    >
      <ProjectSessionNotes
        userId={userId}
        climbId={project.climbId}
        sessionCount={project.sessionCount}
        initialSessions={project.sessions}
      />
    </ProjectCardLayout>
  );
}
