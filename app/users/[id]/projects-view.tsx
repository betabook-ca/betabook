import { ProjectBoard } from "@/components/journal";
import type { ProjectWithSessions } from "@/components/journal";
import { ProjectTabs } from "@/components/journal/project-tabs";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getOpenProjectSuggestions,
  getPinnedClimbIds,
  getPinnedProjects,
  getPinnedProjectSessions,
  OPEN_PROJECT_PAGE_SIZE,
  type JournalEntry,
} from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";

/** Both Projects tabs render from here: `variant` only chooses which side of
 * the pin/send split to list, so the two stay consistent by construction. */
export async function ProjectsView({
  ownerId,
  variant = "open",
}: {
  ownerId: string;
  variant?: "open" | "sent";
}) {
  const sent = variant === "sent";
  const db = await getDb();
  // Suggestions ride along as props rather than through an API route: the list
  // is short, the ownership check is already done here, and refresh() after a
  // pin re-renders this tree with the pinned climb removed from it.
  // The share origin comes from the server, not `window.location`, so server
  // render and hydration agree and preview links point at the preview.
  // Pinned ids span both sides of the split: a pinned, already-sent climb must
  // still read as "Already pinned" in the dialog.
  const [rows, shareOrigin, suggestions, pinnedClimbIds] = await Promise.all([
    getPinnedProjects(db, ownerId, ownerId, { sent }, OPEN_PROJECT_PAGE_SIZE + 1),
    getBaseUrl(),
    sent ? [] : getOpenProjectSuggestions(db, ownerId, ownerId),
    sent ? [] : getPinnedClimbIds(db, ownerId, ownerId),
  ]);
  const hasMore = rows.length > OPEN_PROJECT_PAGE_SIZE;
  const projects = rows.slice(0, OPEN_PROJECT_PAGE_SIZE);

  const sessions = await getPinnedProjectSessions(
    db,
    ownerId,
    ownerId,
    projects.map((project) => project.climbId),
  );
  const byClimb = new Map<number, JournalEntry[]>();
  for (const entry of sessions) {
    if (entry.climbId == null) continue;
    const climbSessions = byClimb.get(entry.climbId);
    if (climbSessions) climbSessions.push(entry);
    else byClimb.set(entry.climbId, [entry]);
  }
  const withSessions: ProjectWithSessions[] = projects.map((project) => ({
    ...project,
    sessions: byClimb.get(project.climbId) ?? [],
  }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeading className="sr-only">
        {sent ? "Sent projects" : "Open projects"}
      </SectionHeading>
      <ProjectTabs view={variant} userId={ownerId} />
      <ProjectBoard
        userId={ownerId}
        projects={withSessions}
        hasMore={hasMore}
        variant={variant}
        suggestions={suggestions}
        pinnedClimbIds={pinnedClimbIds}
        shareOrigin={shareOrigin}
      />
    </div>
  );
}
