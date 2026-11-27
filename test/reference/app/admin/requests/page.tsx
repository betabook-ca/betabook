import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/app/admin/require-admin";
import { ReviewQueue } from "@/components/admin/review-queue";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { getDb } from "@/db/client";
import {
  getAreasByIds,
  getManagedAreas,
  getUsersByIds,
  REVIEW_QUEUE_PAGE_SIZE,
} from "@/db/queries";
import { getReviewQueueDetails } from "@/lib/moderation";
import { getMemberSession } from "@/lib/session";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export const metadata: Metadata = { title: "Review requests" };

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<UrlParamsRecord>;
}) {
  if (!(await getMemberSession())) return <CurrentPageAuthCallout />;
  const params = await searchParams;
  const id = Number(toArray(params.after)[0]);
  const requestedAt = Number(toArray(params.at)[0]);
  const after =
    Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(requestedAt) && requestedAt >= 0
      ? { id, requestedAt }
      : undefined;
  const session = await requireAdminOrRedirect();
  const db = await getDb();

  const [managedAreas, page] = await Promise.all([
    getManagedAreas(db, session.user.id),
    getReviewQueueDetails(db, session, { after, limit: REVIEW_QUEUE_PAGE_SIZE + 1 }),
  ]);

  const hasMore = page.length > REVIEW_QUEUE_PAGE_SIZE;
  const described = page.slice(0, REVIEW_QUEUE_PAGE_SIZE);
  const last = described.at(-1)?.request;
  const nextHref =
    hasMore && last
      ? `/admin/requests?${new URLSearchParams({ after: String(last.id), at: String(last.requestedAt.getTime()) })}`
      : null;
  const [requesters, missingAreas] = await Promise.all([
    getUsersByIds(db, [...new Set(described.flatMap(({ request }) => request.requestedBy ?? []))]),
    getAreasByIds(db, [...new Set(described.flatMap(({ coverage }) => coverage.missingAreaIds))]),
  ]);
  const requestersById = new Map(requesters.map((requester) => [requester.id, requester]));
  const areaNames = new Map(missingAreas.map((area) => [area.id, area.name]));

  const rows = described.map(({ request, description, coverage }) => ({
    id: request.id,
    requestedAt: request.requestedAt.getTime(),
    description,
    // A deleted account has no row to show a face for, so it stays text-only.
    requester: request.requestedBy ? (requestersById.get(request.requestedBy) ?? null) : null,
    alreadyApproved: coverage.approvers.some((approver) => approver.id === session.user.id),
    approvers: coverage.approvers,
    missingAreaNames: coverage.missingAreaIds.flatMap((id) => areaNames.get(id) ?? []),
  }));

  return (
    <ReviewQueue
      managedAreas={managedAreas}
      rows={rows}
      nextHref={nextHref}
      hasPrevious={Boolean(after)}
    />
  );
}
