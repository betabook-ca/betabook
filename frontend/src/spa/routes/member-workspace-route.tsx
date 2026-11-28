import { Outlet, useLocation, useParams } from "react-router";

import { WorkspaceShell } from "@/components/app-shell/workspace-shell";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { primaryAreaForPath } from "@/lib/app-navigation";
import { PageErrorBoundary } from "@/spa/lib/render-error-boundary";

/** Workspace navigation follows the URL while the individual tab loads. */
export function MemberWorkspaceRoute({
  viewerId,
  community = false,
}: {
  viewerId: string | null;
  community?: boolean;
}) {
  const { id } = useParams();
  const { pathname } = useLocation();
  if (!viewerId || (!community && viewerId !== id)) return <Outlet />;
  const area = community ? "community" : primaryAreaForPath(pathname, viewerId);
  if (!area || area === "account") return <Outlet />;
  return (
    <WorkspaceShell area={area} userId={viewerId}>
      <PageErrorBoundary fallback={<SkeletonListRows className="max-md:min-h-svh" />}>
        <Outlet />
      </PageErrorBoundary>
    </WorkspaceShell>
  );
}
