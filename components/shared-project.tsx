import { buttonVariants } from "@heroui/react";

import { AscentStyle } from "@/components/ascent-style";
import { ProjectCardLayout } from "@/components/journal/project-card-layout";
import { ProjectSessionList } from "@/components/journal/project-session-list";
import { SendGradeCell } from "@/components/send-grade-cell";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { ClampedComment } from "@/components/ui/clamped-comment";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { SharedProject, SharedProjectSession } from "@/db/queries";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { SITE_NAME } from "@/lib/site";

/** What a valid project link shows: one climber, one climb, and the work they
 * have put into it — the owner's own view of the project, which is what they
 * chose to show by making the link. Their profile is linked, and reachable
 * anyway: a link only resolves while the profile is public. Their other
 * projects are not, because the Projects tab is owner-only by every read and
 * this link grants one project. The climb is linked, since the catalog is
 * public to everyone. */
export function SharedProject({
  project,
  sessions,
  signedIn,
  path,
}: {
  project: SharedProject;
  sessions: SharedProjectSession[];
  signedIn: boolean;
  /** Where sign-up should return to, so the invitation lands back here. */
  path: string;
}) {
  const verb = project.sent ? "sent" : "is projecting";
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Shared project" className={`flex flex-col gap-4 ${cardClass("md")}`}>
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar name={project.ownerName} image={project.ownerImage} size="lg" />
          <PageTitle className="break-words">
            <AppLink href={`/users/${project.ownerId}`}>{project.ownerName}</AppLink> {verb}{" "}
            {project.climbName}
          </PageTitle>
        </div>

        {/* The same layout the owner's own card uses, so the two cannot drift
         * apart in what a session count or a date means. */}
        <ProjectCardLayout
          project={project}
          today={null}
          area={<span className="text-sm text-muted">{project.areaName}</span>}
        >
          {project.sent && (
            // The send as the owner logged it. The card header already carries
            // the climb's posted grade, so the grade cell leads with their
            // suggestion instead — the same choice the public climb page makes.
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <SendGradeCell
                  type={project.climbType}
                  grade={project.suggestedGrade}
                  gradeFeel={project.gradeFeel ?? "solid"}
                  rating={project.rating}
                />
                {project.ascentStyle && <AscentStyle type={project.ascentStyle} />}
              </div>
              {project.sendComment && (
                <div className="text-sm leading-relaxed text-foreground">
                  <ClampedComment>{project.sendComment}</ClampedComment>
                </div>
              )}
            </div>
          )}
          {project.climbBrokenOn && (
            <p className="text-sm text-warning-soft-foreground">
              This climb has been reported broken, so this project may be missing later sessions.
            </p>
          )}
        </ProjectCardLayout>
      </section>

      <section aria-label="Sessions" className="flex flex-col gap-3">
        <SectionHeading>Sessions</SectionHeading>
        {sessions.length === 0 ? (
          <EmptyState message={`${project.ownerName} hasn't logged a session on this climb yet.`} />
        ) : (
          // The owner's own timeline, minus the companion tags its rows never
          // carry here.
          <ProjectSessionList sessions={sessions} />
        )}
      </section>

      {!signedIn && (
        <section
          aria-label={`Climb with ${project.ownerName} on ${SITE_NAME}`}
          className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${cardClass("md", "bordered")}`}
        >
          <p className="text-sm text-muted">
            {SITE_NAME} is a climbing logbook and crag database. Track your own projects and see the
            work behind every send.
          </p>
          <AppLink href={signUpUrl(path)} className={`${buttonVariants()} shrink-0`}>
            Sign up
          </AppLink>
        </section>
      )}
    </div>
  );
}
