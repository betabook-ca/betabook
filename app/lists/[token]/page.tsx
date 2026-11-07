import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ClimbListHeader } from "@/components/climb-lists/climb-list-header";
import { ClimbListItems } from "@/components/climb-lists/climb-list-items";
import { CopyClimbListButton } from "@/components/climb-lists/copy-climb-list-button";
import { expiredLinkCard } from "@/components/expired-link-card";
import { signUpCard } from "@/components/sign-up-card";
import { AppLink } from "@/components/ui/app-link";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSharedClimbList, getSharedClimbListItems } from "@/db/queries";
import {
  climbListHref,
  climbListSharePath,
  parseClimbListView,
  type ClimbListView,
} from "@/lib/climb-lists";
import { requestMemo } from "@/lib/request-memo";
import { sharedClimbListMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";
import type { UrlParamsRecord } from "@/lib/url-params";

type SharedListPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

/** Cached per request so the page and its metadata resolve the link once. */
const getSharedListByToken = requestMemo(async (token: string) =>
  getSharedClimbList(await getDb(), token),
);

const FALLBACK_METADATA: Metadata = { title: "Shared list", robots: { index: false } };

/** A dead or expired link previews as nothing, like the page it unfurls. */
export async function generateMetadata({ params }: SharedListPageProps): Promise<Metadata> {
  const token = parseShareToken((await params).token);
  if (!token) return FALLBACK_METADATA;
  const { shared } = await getSharedListByToken(token);
  return shared ? sharedClimbListMetadata(shared.owner.name, shared.list.title) : FALLBACK_METADATA;
}

/**
 * A list link: the list as its owner's page shows it, without the owner's
 * controls. The link carries no audience, so the session decides only the
 * owner redirect, the sign-up prompt and whether the reader sees their own
 * sent state. Holding the token is the permission, and the climbs are read
 * through it again in SQL.
 */
export default async function SharedListPage({ params, searchParams }: SharedListPageProps) {
  const [{ token: rawToken }, search] = await Promise.all([params, searchParams]);
  const token = parseShareToken(rawToken);
  if (!token) notFound();
  const [access, session] = await Promise.all([getSharedListByToken(token), getMemberSession()]);
  if (access.status === "hidden") notFound();
  const [ownerId, listId] =
    access.status === "expired"
      ? [access.ownerId, access.listId]
      : [access.shared.owner.id, access.shared.list.id];
  if (session?.user.id === ownerId) redirect(climbListHref(ownerId, listId));
  if (access.status === "expired") return expiredLinkCard("lists");

  const { owner, list } = access.shared;
  const viewerId = session?.user.id ?? null;
  const view = parseClimbListView(search);

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
        actions={viewerId && <CopyClimbListButton list={list} viewerId={viewerId} token={token} />}
      />
      <Suspense fallback={<SkeletonListRows rows={6} />}>
        <SharedListItems
          token={token}
          listId={list.id}
          totalCount={list.climbCount}
          viewerId={viewerId}
          view={view}
        />
      </Suspense>
      {!viewerId &&
        signUpCard({
          ownerName: owner.name,
          path: climbListSharePath(token),
          pitch: "Keep your own lists of climbs to do, and see which ones you've sent.",
        })}
    </div>
  );
}

async function SharedListItems({
  token,
  listId,
  totalCount,
  viewerId,
  view,
}: {
  token: string;
  listId: number;
  totalCount: number;
  viewerId: string | null;
  view: ClimbListView;
}) {
  const db = await getDb();
  const items = await getSharedClimbListItems(db, token, viewerId, view);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    items.map((item) => item.areaId),
  );
  return (
    <ClimbListItems
      items={items}
      totalCount={totalCount}
      areaBreadcrumbs={areaBreadcrumbs}
      view={view}
      signedIn={viewerId !== null}
      listId={listId}
    />
  );
}
