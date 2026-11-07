import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { AddClimbsButton } from "@/components/climb-lists/add-climbs-button";
import { ClimbListActions } from "@/components/climb-lists/climb-list-actions";
import { ClimbListHeader } from "@/components/climb-lists/climb-list-header";
import { ClimbListItems } from "@/components/climb-lists/climb-list-items";
import { ClimbListShare } from "@/components/climb-lists/climb-list-share";
import { CopyClimbListButton } from "@/components/climb-lists/copy-climb-list-button";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getClimbListForUser,
  getClimbListItems,
  getClimbListShareForOwner,
  type ClimbListSummary,
} from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { climbListsHref, parseClimbListView, type ClimbListView } from "@/lib/climb-lists";
import { parseId } from "@/lib/parse-id";
import { requestMemo } from "@/lib/request-memo";
import type { UrlParamsRecord } from "@/lib/url-params";

type ListPageProps = {
  params: Promise<{ id: string; listId: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

const getList = requestMemo(async (ownerId: string, listId: number, viewerId: string) =>
  getClimbListForUser(await getDb(), ownerId, listId, viewerId),
);

/** The profile gate, then the list itself under the same lists audience. */
async function resolveListPage(id: string, rawListId: string) {
  const resolved = await resolveProfilePage(id, "lists");
  if (!resolved.signedIn || !resolved.ok) return { resolved, list: null };
  const listId = parseId(rawListId);
  const list = listId === null ? null : await getList(id, listId, resolved.viewerId);
  return { resolved, list };
}

export async function generateMetadata({ params }: ListPageProps): Promise<Metadata> {
  const { id, listId } = await params;
  const { resolved, list } = await resolveListPage(id, listId);
  if (resolved.signedIn && resolved.ok && !list) notFound();
  return memberMetadata(resolved, (user) => `${list?.title ?? "List"} · ${user.name}`);
}

/** One list. Sorting and the sent filter come from the URL and never change
 * the list. A signed-out reader needs the list's own link, at /lists/{token}. */
export default async function ListPage({ params, searchParams }: ListPageProps) {
  const [{ id, listId }, search] = await Promise.all([params, searchParams]);
  const { resolved, list } = await resolveListPage(id, listId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok || !list) notFound();
  const { user, viewerId } = resolved;
  const isOwner = viewerId === user.id;
  const view = parseClimbListView(search);
  // Only the owner gets the list's link: the token is the credential.
  const ownerShare = isOwner
    ? await Promise.all([getClimbListShareForOwner(await getDb(), user.id, list.id), getBaseUrl()])
    : null;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
      <div className="flex min-w-0 flex-col gap-5">
        <ClimbListHeader
          list={list}
          back={climbListsHref(user.id)}
          byline={isOwner ? undefined : `By ${user.name}`}
          actions={
            ownerShare ? (
              <>
                <ClimbListShare
                  listId={list.id}
                  listTitle={list.title}
                  share={ownerShare[0]}
                  shareOrigin={ownerShare[1]}
                  isPrivate={user.isPrivate}
                />
                <ClimbListActions list={list} userId={user.id} leaveOnDelete />
              </>
            ) : (
              <CopyClimbListButton list={list} viewerId={viewerId} />
            )
          }
        />
        <Suspense fallback={<SkeletonListRows rows={6} />}>
          <ListItems
            ownerId={user.id}
            viewerId={viewerId}
            list={list}
            view={view}
            isOwner={isOwner}
          />
        </Suspense>
      </div>
    </ProfileHeader>
  );
}

async function ListItems({
  ownerId,
  viewerId,
  list,
  view,
  isOwner,
}: {
  ownerId: string;
  viewerId: string;
  list: ClimbListSummary;
  view: ClimbListView;
  isOwner: boolean;
}) {
  const db = await getDb();
  const items = await getClimbListItems(db, ownerId, list.id, viewerId, view);
  // The owner's picker needs every climb on the list, not just the filtered
  // ones, to mark what is already there.
  const allClimbIds =
    isOwner && view.sent !== "all"
      ? (await getClimbListItems(db, ownerId, list.id, viewerId, { ...view, sent: "all" })).map(
          (item) => item.climbId,
        )
      : items.map((item) => item.climbId);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    items.map((item) => item.areaId),
  );
  const addClimbs = (variant?: "outline") =>
    isOwner && (
      <AddClimbsButton
        listId={list.id}
        listTitle={list.title}
        climbIds={allClimbIds}
        variant={variant}
      />
    );

  return (
    <div className="flex flex-col gap-3">
      {isOwner && list.climbCount > 0 && <div className="self-end">{addClimbs("outline")}</div>}
      <ClimbListItems
        items={items}
        totalCount={list.climbCount}
        areaBreadcrumbs={areaBreadcrumbs}
        view={view}
        signedIn
        listId={list.id}
        canEdit={isOwner}
        emptyAction={addClimbs()}
      />
    </div>
  );
}
