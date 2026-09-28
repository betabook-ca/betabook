"use client";

import { useParams, usePathname } from "next/navigation";

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
