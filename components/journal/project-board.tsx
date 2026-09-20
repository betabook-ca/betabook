"use client";

import { useOverlayState } from "@heroui/react";
import { useMemo, useState } from "react";

import { JournalEntryDrawer } from "@/components/journal/journal-entry-drawer";
import { PinProjectButton } from "@/components/journal/pin-project-button";
import { ProjectCard, type ProjectWithSessions } from "@/components/journal/project-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { OptionSelect } from "@/components/ui/option-select";
import { QueryInput } from "@/components/ui/query-input";
import type { OpenProject } from "@/db/queries";
import { useMounted } from "@/hooks/use-mounted";

type ProjectBoardVariant = "open" | "sent";

const OPEN_SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "sessions", label: "Most sessions" },
  { value: "longest", label: "Longest running" },
  { value: "pinned", label: "Recently tracked" },
  { value: "name", label: "Name" },
] as const;

const SENT_SORTS = [
  { value: "sent", label: "Recently sent" },
  { value: "sessions", label: "Most sessions" },
  { value: "longest", label: "Longest running" },
  { value: "pinned", label: "Recently tracked" },
  { value: "name", label: "Name" },
] as const;

type ProjectSort = (typeof OPEN_SORTS)[number]["value"] | (typeof SENT_SORTS)[number]["value"];

/** A pin with no sessions has no date to sort on. Order those among themselves
 * by when they were pinned rather than letting an empty string win a
 * `localeCompare`, which would bury or float them arbitrarily. */
function byDateDesc(
  a: string | null,
  b: string | null,
  tieBreak: (left: ProjectWithSessions, right: ProjectWithSessions) => number,
  left: ProjectWithSessions,
  right: ProjectWithSessions,
): number {
  if (a == null && b == null) return tieBreak(left, right);
  if (a == null) return 1;
  if (b == null) return -1;
  return b.localeCompare(a) || tieBreak(left, right);
}

const byPinnedAt = (a: ProjectWithSessions, b: ProjectWithSessions) =>
  b.pinnedAt.localeCompare(a.pinnedAt) || a.climbId - b.climbId;

const COMPARATORS: Record<ProjectSort, (a: ProjectWithSessions, b: ProjectWithSessions) => number> =
  {
    recent: (a, b) => byDateDesc(a.lastSession, b.lastSession, byPinnedAt, a, b),
    sent: (a, b) => byDateDesc(a.sentOn, b.sentOn, byPinnedAt, a, b),
    sessions: (a, b) => b.sessionCount - a.sessionCount || byPinnedAt(a, b),
    longest: (a, b) => {
      // Ascending by first session, so the nulls check is inverted: a pin with
      // no history has not been running at all.
      if (a.firstSession == null && b.firstSession == null) return byPinnedAt(a, b);
      if (a.firstSession == null) return 1;
      if (b.firstSession == null) return -1;
      return a.firstSession.localeCompare(b.firstSession) || a.climbId - b.climbId;
    },
    pinned: byPinnedAt,
    name: (a, b) => a.climbName.localeCompare(b.climbName) || a.climbId - b.climbId,
  };

/** Stable identity for the default, so an open board without suggestions does
 * not hand the pin button a fresh array on every render. */
const NO_SUGGESTIONS: readonly OpenProject[] = [];

/** Search includes only the preloaded notes, not older paginated sessions. */
function haystack(project: ProjectWithSessions): string {
  return [
    project.climbName,
    project.areaName,
    ...project.sessions.flatMap((entry) => [entry.body ?? "", ...entry.tags]),
  ]
    .join("\n")
    .toLowerCase();
}

type ProjectBoardProps = {
  userId: string;
  projects: ProjectWithSessions[];
  hasMore: boolean;
  variant?: ProjectBoardVariant;
  /** Unsent climbs offered in the pin modal; empty on the sent board. */
  suggestions?: readonly OpenProject[];
  /** Every climb the owner has pinned, both sides of the send split. The
   * server passes it because this board only holds one side; the fallback
   * below is enough for a story, not for the live page. */
  pinnedClimbIds?: readonly number[];
  /** The site's own origin, resolved on the server so a share link is the
   * same string in the render and in the hydration on a preview domain. */
  shareOrigin: string;
};

/** Filtering and sorting stay client-side: the page holds at most `OPEN_PROJECT_PAGE_SIZE` projects. */
export function ProjectBoard({
  userId,
  projects,
  hasMore,
  variant = "open",
  suggestions = NO_SUGGESTIONS,
  pinnedClimbIds,
  shareOrigin,
}: ProjectBoardProps) {
  const sents = variant === "sent";
  const sorts = sents ? SENT_SORTS : OPEN_SORTS;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>(sents ? "sent" : "recent");
  const [selected, setSelected] = useState<ProjectWithSessions | null>(null);
  const drawer = useOverlayState();
  const mounted = useMounted();
  // Resolved on the client only: the server has no reader timezone, and a
  // date that disagreed across the hydration boundary would be a mismatch.
  const today = mounted ? new Intl.DateTimeFormat("en-CA").format(new Date()) : null;

  const shownClimbIds = useMemo(() => projects.map((project) => project.climbId), [projects]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? projects.filter((project) => haystack(project).includes(needle))
      : projects;
    return [...matched].sort(COMPARATORS[sort]);
  }, [projects, query, sort]);

  const pinButton = sents ? null : (
    <PinProjectButton suggestions={suggestions} pinnedClimbIds={pinnedClimbIds ?? shownClimbIds} />
  );
  const empty = projects.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* The toolbar renders in every state, including the empty one. It is
       * where the track control lives, and an empty board that dropped the
       * row would move the button on the climber's first one. Filtering
       * nothing is harmless; losing the action is not. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <QueryInput
          value={query}
          onChange={setQuery}
          label="Filter projects"
          placeholder="Search…"
        />
        <div className="flex items-center gap-2">
          <OptionSelect
            ariaLabel="Sort projects"
            value={sort}
            onChange={setSort}
            options={sorts}
            className={FIELD_WIDTH_CLASS.medium}
          />
          {pinButton}
        </div>
      </div>

      {empty ? (
        <EmptyState
          message={
            sents
              ? "No sent projects yet. Tracked climbs move here once you log a send."
              : "No projects tracked yet. Track a climb and it shows up here."
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState message="No projects match this search." />
      ) : (
        <ul aria-label={sents ? "Sent projects" : "Open projects"} className="flex flex-col gap-3">
          {visible.map((project) => (
            <li key={project.climbId}>
              <ProjectCard
                project={project}
                userId={userId}
                today={today}
                shareOrigin={shareOrigin}
                onLogSession={() => {
                  setSelected(project);
                  drawer.open();
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && <p className="text-sm text-muted">Showing the most recently active projects.</p>}
      {selected && (
        <JournalEntryDrawer
          climb={{
            id: selected.climbId,
            name: selected.climbName,
            type: selected.climbType,
            grade: selected.climbGrade,
            brokenOn: selected.climbBrokenOn,
            areaId: selected.areaId,
          }}
          state={drawer}
        />
      )}
    </div>
  );
}
