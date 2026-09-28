"use client";

import { Button } from "@heroui/react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { FeedActivityNav } from "@/components/feed-activity-nav";
import { FriendTabs } from "@/components/friend-tabs";
import { Skeleton, SkeletonFeedCard, SkeletonListRows } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useClientSession } from "@/hooks/use-client-session";
import { primaryAreaForPath } from "@/lib/app-navigation";
import { parseFeedView } from "@/lib/feed";

/** Loading state for a climber's pages. Their owner's workspace tabs follow
 * from the URL alone, so the owner keeps the real tabs — already showing the
 * one they picked — and only the content below them waits. Anyone else sees
 * a header placeholder: who the climber is, and which tabs a visitor may
 * open, has to come from the server. */
export function ProfileLoading() {
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const session = useClientSession();
  const area = session?.user.id === id ? primaryAreaForPath(pathname, id) : undefined;
  const rows = <SkeletonListRows rows={8} />;
  if (area === "logbook" || area === "progress") {
    return (
      <WorkspaceShell area={area} userId={id}>
        {rows}
      </WorkspaceShell>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      {rows}
    </div>
  );
}

/** Loading state for Feed and Friends. Their Community tabs and in-page
 * pills are links the URL already decides, so a signed-in reader keeps them
 * — already marking the ones they picked — and only the content waits. A
 * signed-out reader gets a sign-in callout instead of the workspace, so no
 * navigation. */
function CommunityLoading({
  viewerId,
  label,
  toolbar,
  children,
}: {
  viewerId: string | null;
  label: string;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  const placeholder = (
    <div role="status" aria-label={label} className="flex w-full flex-col gap-4">
      {children}
    </div>
  );
  if (!viewerId) return placeholder;
  return (
    <WorkspaceShell area="community" userId={viewerId}>
      {toolbar}
      {placeholder}
    </WorkspaceShell>
  );
}

export function FeedLoading() {
  const viewerId = useClientSession()?.user.id ?? null;
  const view = parseFeedView(useSearchParams().get("view"));
  return (
    <CommunityLoading
      viewerId={viewerId}
      label="Loading feed"
      toolbar={
        // FeedList's toolbar row, with Refresh feed held until the feed is in.
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FeedActivityNav view={view} />
          <Button variant="ghost" size="sm" className="ml-auto" isDisabled>
            Refresh feed
          </Button>
        </div>
      }
    >
      <SkeletonFeedCard />
      <SkeletonFeedCard />
    </CommunityLoading>
  );
}

export function FriendsLoading() {
  const viewerId = useClientSession()?.user.id ?? null;
  const view = useSearchParams().get("view") === "requests" ? "requests" : "friends";
  return (
    <CommunityLoading
      viewerId={viewerId}
      label="Loading friends"
      toolbar={viewerId && <FriendTabs view={view} userId={viewerId} />}
    >
      <SkeletonListRows rows={6} />
    </CommunityLoading>
  );
}

/** Rendered once by the root layout so every page's RSC payload references
 * this module. React resolves a client component asynchronously the first
 * time a payload names its module; if that first time is a navigation's
 * loading state, the state suspends up to app/loading.tsx for a tick and
 * React throttles its reveal by 300 ms — the search page's skeleton
 * flashes before the section's. */
export function WorkspaceLoadingModule() {
  return null;
}
