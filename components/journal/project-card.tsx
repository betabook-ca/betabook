"use client";

import { Button, useOverlayState } from "@heroui/react";
import { CirclePlus, CircleX, Share2 } from "lucide-react";
import { useState, useTransition } from "react";

import { unpinProject } from "@/actions";
import { AreaBreadcrumb } from "@/components/area-breadcrumb";
import { ProjectCardLayout } from "@/components/journal/project-card-layout";
import { ProjectSessionNotes } from "@/components/journal/project-session-notes";
import { ShareProjectDialog } from "@/components/journal/share-project-dialog";
import { AppLink } from "@/components/ui/app-link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { JournalEntry, PinnedProject } from "@/db/queries";
import { describeShareExpiry, isShareExpired } from "@/lib/share-expiry";
import { climbHref } from "@/lib/slug";

/** A tracked project with the sessions the server preloaded for it. */
export type ProjectWithSessions = PinnedProject & { sessions: JournalEntry[] };

type ProjectCardProps = {
  project: ProjectWithSessions;
  userId: string;
  today: string | null;
  /** The site's own origin, for the link the share dialog hands over. */
  shareOrigin: string;
  onLogSession: () => void;
};

export function ProjectCard({
  project,
  userId,
  today,
  shareOrigin,
  onLogSession,
}: ProjectCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useOverlayState();
  const shareDialog = useOverlayState();
  // An expired link reads as no link at all. The row survives until something
  // writes over it, and a card that said "Shared" beside a URL answering
  // "this link has expired" would misdescribe the project's state.
  //
  // Judged against `today`, which the board resolves on the client after
  // mount and passes as null before it. Reading the clock here instead would
  // decide this during the server render too, and a link expiring between the
  // two would hydrate into a different card than it rendered as.
  const liveShare =
    project.share && !isShareExpired(project.share.expiresAt, today) ? project.share : null;

  function handleUntrack() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await unpinProject(project.climbId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Revalidation removes this card; close in case it is still mounted.
      confirm.close();
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
        <div className="flex flex-wrap items-center gap-2 self-start">
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
            variant={liveShare ? "outline" : "ghost"}
            className="gap-1.5"
            aria-label={
              liveShare ? `Manage the link for ${project.climbName}` : `Share ${project.climbName}`
            }
            onPress={shareDialog.open}
          >
            <Share2 className="size-4" />
            {liveShare ? "Shared" : "Share"}
          </Button>
          {liveShare && (
            <span className="text-xs text-muted">{describeShareExpiry(liveShare.expiresAt)}</span>
          )}
          {/* Held back until the client clock is known. The dialog seeds its
           * state from `share` on mount and keeps it, so mounting it while
           * `today` is still null would bake in an expired link and offer
           * Renew and Stop sharing beside a URL that no longer resolves.
           * Nothing can open it before then anyway. */}
          {today != null && (
            <ShareProjectDialog
              state={shareDialog}
              climbId={project.climbId}
              climbName={project.climbName}
              share={liveShare}
              shareOrigin={shareOrigin}
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            aria-label={`Untrack ${project.climbName}`}
            isDisabled={pending}
            onPress={confirm.open}
          >
            <CircleX className="size-4" />
            Untrack
          </Button>
          {/* Confirmed rather than immediate, because the button sits beside a
           * list of the climber's own notes and reads like it might take them
           * with it. The dialog exists mainly to say that it doesn't — which
           * is also why the action isn't styled as a danger. */}
          <ConfirmDialog
            state={confirm}
            title={`Untrack ${project.climbName}?`}
            description="It leaves your Projects tab only. Every session and journal entry on this climb is kept, and you can track it again whenever you like."
            confirmLabel="Untrack"
            cancelLabel="Keep tracking"
            tone="default"
            isPending={pending}
            error={error}
            onConfirm={handleUntrack}
            onClose={() => setError(null)}
          />
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
