import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError, isUnauthorizedError } from "@/spa/lib/fetch-json";
import {
  SpaJournalView,
  SpaProfileHeader,
  SpaSendsView,
  SpaSharedProfileView,
} from "@/spa/lib/profile-shell";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type LoadedProfileState = {
  targetUserId: string;
  viewerId: string | null;
  query: string;
  payload: ApiResponse<"/api/pages/users/{id}">;
};

function useProfileTitle(
  current: LoadedProfileState["payload"] | null | undefined,
  notFound: boolean,
  unauthorized: boolean,
) {
  const shared = current?.mode === "shared";
  usePageTitle(
    notFound
      ? "Climber not found"
      : unauthorized
        ? "Member content"
        : shared
          ? current.owner.name + " on Betabook"
          : current?.user.name,
    shared && !notFound && !unauthorized,
  );
}

export default function UserProfileRoute({ viewerId }: { viewerId: string | null }) {
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const refreshKey = useRouterRefreshKey();
  const userId = params.id ?? "";
  const rawQuery = searchParams.toString();
  const searchRecord = searchParamsToRecord(searchParams);

  const [state, setState] = useState<LoadedProfileState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches =
    state !== null &&
    userId.length > 0 &&
    state.targetUserId === userId &&
    state.viewerId === viewerId &&
    state.query === rawQuery;

  useEffect(() => {
    if (!userId) {
      return;
    }
    const targetUserId = userId;
    const targetViewerId = viewerId;
    let cancelled = false;

    async function loadProfile() {
      try {
        const payload = await fetchApi("/api/pages/users/{id}", {
          path: { id: targetUserId },
          query: new URLSearchParams(rawQuery),
        });
        if (!cancelled) {
          setError(null);
          setNotFound(false);
          setUnauthorized(false);
          setState({
            targetUserId,
            viewerId: targetViewerId,
            query: rawQuery,
            payload,
          });
        }
      } catch (err) {
        if (!cancelled) {
          if (isUnauthorizedError(err)) {
            setUnauthorized(true);
            setNotFound(false);
            setError(null);
          } else if (isNotFoundError(err)) {
            setNotFound(true);
            setUnauthorized(false);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load climber profile");
          }
        }
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userId, viewerId, rawQuery, refreshKey]);

  useProfileTitle(matches ? state?.payload : null, notFound, unauthorized);
  if (!userId || notFound) {
    return (
      <div className="py-8 text-center">
        <PageTitle>Climber not found</PageTitle>
        <p className="mt-2 text-sm text-muted">No climber profile is available at this URL.</p>
      </div>
    );
  }
  if (unauthorized) {
    return <CurrentPageAuthCallout />;
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-6 text-danger">
        {error}
      </div>
    );
  }
  if (!matches || !state) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-56" />
        <SkeletonListRows rows={8} />
      </div>
    );
  }

  if (state.payload.mode === "shared") {
    return <SpaSharedProfileView payload={state.payload} />;
  }

  const member = state.payload;
  const activeViewerId = viewerId ?? member.user.id;

  return (
    <SpaProfileHeader
      user={member.user}
      isOwner={member.isOwner}
      relationship={member.relationship}
      access={member.access}
      hardest={member.hardest}
    >
      {member.defaultTab === "journal" ? (
        <SpaJournalView
          ownerId={member.user.id}
          isOwner={member.isOwner}
          filter={parseJournalFilter(searchRecord)}
          data={member.journal}
        />
      ) : (
        <SpaSendsView
          ownerId={member.user.id}
          viewerId={activeViewerId}
          filter={parseUserSendsFilter(searchRecord)}
          basePath={`/users/${member.user.id}`}
          data={member.sends}
        />
      )}
    </SpaProfileHeader>
  );
}
