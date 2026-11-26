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
import {
  climbListViewSearch,
  climbListHref,
  climbListsHref,
  climbListSharePath,
  parseClimbListView,
  type ClimbListView,
} from "@/lib/climb-lists";
import { SHARING_AUDIENCES } from "@/lib/privacy";
import { searchParamsToRecord } from "@/lib/url-params";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { SpaProfileHeader } from "@/spa/lib/profile-shell";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

type Index = ApiResponse<"/api/pages/users/{id}/lists">;
type Detail = ApiResponse<"/api/pages/users/{id}/lists/{list_id}">;
type LinkPage = ApiResponse<"/api/pages/lists/{token}">;
type Shared = Extract<LinkPage, { mode: "shared" }>;
type Payload = Index | Detail | LinkPage;

function MemberList({
  data,
  viewerId,
  view,
  pending,
}: {
  data: Index | Detail;
  viewerId: string;
  view: ClimbListView;
  pending: boolean;
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
          pending={pending}
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
  pending,
}: {
  data: Shared;
  viewerId: string | null;
  token: string;
  view: ClimbListView;
  pending: boolean;
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
      <ClimbListItems
        {...page}
        pending={pending}
        totalCount={list.climbCount}
        view={view}
        signedIn={!!viewerId}
      />
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
  pending,
}: {
  data: Payload;
  viewerId: string | null;
  token: string | undefined;
  view: ClimbListView;
  pending: boolean;
}) {
  switch (data.mode) {
    case "owner":
      return <Navigate to={climbListHref(data.ownerId, data.listId)} replace />;
    case "expired":
      return expiredLinkCard("lists");
    case "shared":
      return token ? (
        <SharedList
          data={data}
          viewerId={data.viewerId}
          token={token}
          view={view}
          pending={pending}
        />
      ) : null;
    default:
      return viewerId ? (
        <MemberList data={data} viewerId={viewerId} view={view} pending={pending} />
      ) : (
        <CurrentPageAuthCallout />
      );
  }
}

function useListTitle(data: Payload | undefined) {
  usePageTitle(
    data?.mode === "index"
      ? data.header.user.name + " · Lists"
      : data?.mode === "detail"
        ? data.header.user.name + " · " + data.list.title
        : data?.mode === "shared"
          ? data.owner.name + " · " + data.list.title
          : null,
  );
}

export default function ListsRoute({ viewerId }: { viewerId: string | null }) {
  const { id, listId, token } = useParams();
  const [search] = useSearchParams();
  const query =
    token || listId ? climbListViewSearch(parseClimbListView(searchParamsToRecord(search))) : "";
  const scope = token || (id && viewerId) ? JSON.stringify([viewerId, id, listId, token]) : null;
  const {
    data,
    query: loadedQuery,
    error,
    pending,
  } = useRetainedPage<Payload>({
    scope,
    query,
    load: (signal) => {
      const options = { query: new URLSearchParams(query), signal };
      if (token) return fetchApi("/api/pages/lists/{token}", { ...options, path: { token } });
      if (listId)
        return fetchApi("/api/pages/users/{id}/lists/{list_id}", {
          ...options,
          path: { id: id ?? "", list_id: listId },
        });
      return fetchApi("/api/pages/users/{id}/lists", { path: { id: id ?? "" }, signal });
    },
  });
  // Pair rows with the query that loaded them: editing always needs the complete circuit.
  const view = parseClimbListView(searchParamsToRecord(new URLSearchParams(loadedQuery)));
  useListTitle(data);
  if (!token && !viewerId) return <CurrentPageAuthCallout />;

  return (
    <ClimbListEditingProvider key={scope}>
      {Boolean(error) && (
        <p role="alert">
          {isNotFoundError(error) ? "List not found" : "Could not load the list. Please try again."}
        </p>
      )}
      {data ? (
        <LoadedList data={data} viewerId={viewerId} token={token} view={view} pending={pending} />
      ) : (
        !error && <SkeletonListRows rows={6} />
      )}
    </ClimbListEditingProvider>
  );
}
