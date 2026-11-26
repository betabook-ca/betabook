import { useEffect, useState, type ComponentProps } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";

import { ClimbListActions } from "@/components/climb-lists/climb-list-actions";
import {
  ClimbListEditingProvider,
  ClimbListEditButton,
} from "@/components/climb-lists/climb-list-editing";
import { ClimbListHeader } from "@/components/climb-lists/climb-list-header";
import { ClimbListIndex } from "@/components/climb-lists/climb-list-index";
import { ClimbListItems } from "@/components/climb-lists/climb-list-items";
import { ClimbListShare } from "@/components/climb-lists/climb-list-share";
import { CopyClimbListButton } from "@/components/climb-lists/copy-climb-list-button";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { expiredLinkCard } from "@/components/expired-link-card";
import { signUpCard } from "@/components/sign-up-card";
import { AppLink } from "@/components/ui/app-link";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AreaBreadcrumbs, ClimbListItem, ClimbListSummary } from "@/db/queries";
import {
  climbListHref,
  climbListsHref,
  climbListSharePath,
  parseClimbListView,
  type ClimbListView,
} from "@/lib/climb-lists";
import { SHARING_AUDIENCES, type SharingAudience } from "@/lib/privacy";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchJson, isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader } from "@/spa/lib/profile-shell";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type Header = Omit<ComponentProps<typeof SpaProfileHeader>, "children" | "workspace">;
type Items = { items: ClimbListItem[]; areaBreadcrumbs: AreaBreadcrumbs };
type Index = {
  mode: "index";
  header: Header;
  lists: ClimbListSummary[];
  audience: SharingAudience | null;
};
type Detail = {
  mode: "detail";
  header: Header;
  list: ClimbListSummary;
  page: Items;
  share: ComponentProps<typeof ClimbListShare>["share"];
  shareOrigin: string;
};
type Shared = {
  mode: "shared";
  owner: { id: string; name: string; image: string | null };
  list: Pick<ClimbListSummary, "title" | "description" | "climbCount">;
  page: Items;
};
type Payload =
  | Index
  | Detail
  | Shared
  | { mode: "expired" }
  | { mode: "owner"; ownerId: string; listId: number };

function MemberList({
  data,
  viewerId,
  view,
}: {
  data: Index | Detail;
  viewerId: string;
  view: ClimbListView;
}) {
  const { user, isOwner } = data.header;
  if (data.mode === "index") {
    const label = SHARING_AUDIENCES.find((a) => a.value === data.audience)?.label;
    return (
      <SpaProfileHeader {...data.header} workspace="progress">
        <ClimbListIndex
          lists={data.lists}
          userId={user.id}
          canEdit={isOwner}
          note={
            label && (
              <>
                Visible to {label} ·{" "}
                <AppLink href="/account#privacy" className="inline underline">
                  Change
                </AppLink>
              </>
            )
          }
        />
      </SpaProfileHeader>
    );
  }
  const { list, page } = data;
  return (
    <SpaProfileHeader {...data.header} workspace="progress">
      <div className="flex min-w-0 flex-col gap-5">
        <ClimbListHeader
          list={list}
          back={climbListsHref(user.id)}
          byline={isOwner ? undefined : `By ${user.name}`}
          actions={
            isOwner ? (
              <>
                <ClimbListEditButton variant={list.climbCount > 0 ? "outline" : undefined} />
                <ClimbListShare
                  listId={list.id}
                  listTitle={list.title}
                  share={data.share}
                  shareOrigin={data.shareOrigin}
                  isPrivate={user.isPrivate}
                />
                <ClimbListActions list={list} userId={user.id} leaveOnDelete />
              </>
            ) : (
              <CopyClimbListButton list={list} viewerId={viewerId} source={{ listId: list.id }} />
            )
          }
        />
        <ClimbListItems
          {...page}
          totalCount={list.climbCount}
          view={view}
          signedIn
          listId={list.id}
          canEdit={isOwner}
          listTitle={list.title}
        />
      </div>
    </SpaProfileHeader>
  );
}

function SharedList({
  data,
  viewerId,
  token,
  view,
}: {
  data: Shared;
  viewerId: string | null;
  token: string;
  view: ClimbListView;
}) {
  const { owner, list, page } = data;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={owner.name} image={owner.image} size="lg" />
        <PageTitle className="min-w-0 break-words">
          <AppLink href={`/users/${owner.id}`}>{owner.name}</AppLink>&apos;s list
        </PageTitle>
      </div>
      <ClimbListHeader
        list={list}
        actions={
          viewerId && <CopyClimbListButton list={list} viewerId={viewerId} source={{ token }} />
        }
      />
      <ClimbListItems {...page} totalCount={list.climbCount} view={view} signedIn={!!viewerId} />
      {!viewerId &&
        signUpCard({
          ownerName: owner.name,
          path: climbListSharePath(token),
          pitch: "Keep your own lists of climbs to do, and see which ones you've sent.",
        })}
    </div>
  );
}

function LoadedList({
  data,
  viewerId,
  token,
  view,
}: {
  data: Payload;
  viewerId: string | null;
  token: string | undefined;
  view: ClimbListView;
}) {
  switch (data.mode) {
    case "owner":
      return <Navigate to={climbListHref(data.ownerId, data.listId)} replace />;
    case "expired":
      return expiredLinkCard("lists");
    case "shared":
      return token ? (
        <SharedList data={data} viewerId={viewerId} token={token} view={view} />
      ) : null;
    default:
      return viewerId ? (
        <MemberList data={data} viewerId={viewerId} view={view} />
      ) : (
        <CurrentPageAuthCallout />
      );
  }
}

export default function ListsRoute({ viewerId }: { viewerId: string | null }) {
  const { id, listId, token } = useParams();
  const [search] = useSearchParams();
  const refresh = useRouterRefreshKey();
  const view = parseClimbListView(searchParamsToRecord(search));
  const path = token
    ? `/api/pages/lists/${encodeURIComponent(token)}`
    : id && viewerId
      ? `/api/pages/users/${encodeURIComponent(id)}/lists${listId ? `/${encodeURIComponent(listId)}` : ""}`
      : "";
  const url = path && `${path}?${search}`;
  const key = JSON.stringify([viewerId, url]);
  const [loaded, setLoaded] = useState<{ key: string; data?: Payload; error?: string }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    async function load() {
      try {
        const data = await fetchJson<Payload>(url, { signal: controller.signal });
        if (!controller.signal.aborted) setLoaded({ key, data });
      } catch (err) {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            error: isNotFoundError(err)
              ? "List not found"
              : "Could not load the list. Please try again.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, url, refresh]);
  if (!token && !viewerId) return <CurrentPageAuthCallout />;
  const current = key === loaded?.key ? loaded : undefined;
  const data = current?.data;
  return (
    <ClimbListEditingProvider key={JSON.stringify([viewerId, path])}>
      {current?.error ? (
        <p role="alert">{current.error}</p>
      ) : !data ? (
        <SkeletonListRows rows={6} />
      ) : (
        <LoadedList data={data} viewerId={viewerId} token={token} view={view} />
      )}
    </ClimbListEditingProvider>
  );
}
