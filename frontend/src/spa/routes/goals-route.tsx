import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { GoalPanel } from "@/components/goals/goal-panel";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type GoalOverview = ApiResponse<"/api/pages/users/{id}/goals">;

function OwnerGoals({ ownerId }: { ownerId: string }) {
  const [data, setData] = useState<GoalOverview | null>(null);
  const [error, setError] = useState("");
  const revision = useRouterRefreshKey();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const next = await fetchApi("/api/pages/users/{id}/goals", {
          path: { id: ownerId },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setError("");
          setData(next);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            isNotFoundError(cause) ? "Climber not found" : "Couldn't load goals. Try again.",
          );
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [ownerId, revision]);
  return error ? (
    <p role="alert">{error}</p>
  ) : data ? (
    <GoalPanel ownerId={ownerId} {...data} />
  ) : (
    <SkeletonListRows rows={4} className="max-md:min-h-svh" />
  );
}

export default function GoalsRoute({ viewerId }: { viewerId: string | null }) {
  const { id } = useParams();
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (id !== viewerId) return <PageTitle>Climber not found</PageTitle>;
  return <OwnerGoals key={id} ownerId={id} />;
}
