"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useClientSession } from "@/hooks/use-client-session";
import { primaryAreaForPath } from "@/lib/app-navigation";

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

/** Loading state for Feed and Friends. Their Community tabs are the same
 * for every member, so a signed-in reader keeps them — already marking the
 * one they picked — around the section's placeholder. A signed-out reader
 * gets a sign-in callout instead of the workspace, so no tabs. */
export function CommunityLoading({ label, children }: { label: string; children: ReactNode }) {
  const session = useClientSession();
  const placeholder = (
    <div role="status" aria-label={label} className="flex w-full flex-col gap-4">
      {children}
    </div>
  );
  if (!session) return placeholder;
  return (
    <WorkspaceShell area="community" userId={session.user.id}>
      {placeholder}
    </WorkspaceShell>
  );
}
