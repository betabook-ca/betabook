"use client";

import { Button } from "@heroui/react";
import { CirclePlus, PinOff } from "lucide-react";
import { useState, useTransition } from "react";

import { unpinProject } from "@/actions";
import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ProjectCardLayout } from "@/components/journal/project-card-layout";
import { ProjectSessionNotes } from "@/components/journal/project-session-notes";
import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { JournalEntry, PinnedProject } from "@/db/queries";
import { climbHref } from "@/lib/slug";

/** A pinned project with the sessions the server preloaded for it. */
export type ProjectWithSessions = PinnedProject & { sessions: JournalEntry[] };

type ProjectCardProps = {
  project: ProjectWithSessions;
  userId: string;
  today: string | null;
  onLogSession: () => void;
};

export function ProjectCard({ project, userId, today, onLogSession }: ProjectCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleUnpin() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await unpinProject(project.climbId);
      // The server revalidates and refreshes on success, which drops this card
      // from the list; only a failure has anything left to render.
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <ProjectCardLayout
      project={project}
      today={today}
      title={
        <AppLink href={climbHref(project.climbId, project.climbName)}>{project.climbName}</AppLink>
      }
      area={<AreaBreadcrumb areaId={project.areaId} areaName={project.areaName} ancestors={[]} />}
      action={
        <div className="flex flex-col gap-2 self-start">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              aria-label={`Log a session on ${project.climbName}`}
              onPress={onLogSession}
            >
              <CirclePlus className="size-4" />
              Log session
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              aria-label={`Unpin ${project.climbName}`}
              isDisabled={pending}
              onPress={handleUnpin}
            >
              <PinOff className="size-4" />
              Unpin
            </Button>
          </div>
          {error && <InlineAlert>{error}</InlineAlert>}
        </div>
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
