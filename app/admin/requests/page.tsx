import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/app/admin/require-admin";
import { ApproveRejectControls } from "@/components/admin/approve-reject-controls";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getAreasByIds,
  getManagedAreas,
  getUsersByIds,
  REVIEW_QUEUE_PAGE_SIZE,
} from "@/db/queries";
import { getReviewQueueDetails } from "@/lib/moderation";
import { getMemberSession as getSession } from "@/lib/session";
import { areaHref } from "@/lib/slug";

export const metadata: Metadata = { title: "Review requests" };

const REQUESTED_AT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; at?: string }>;
}) {
  if (!(await getSession())) return <CurrentPageAuthCallout />;
  const params = await searchParams;
  const id = Number(params.after);
  const requestedAt = Number(params.at);
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
  const requesterNames = new Map(requesters.map((requester) => [requester.id, requester.name]));
  const areaNames = new Map(missingAreas.map((area) => [area.id, area.name]));

  const rows = described.map(({ request, description, coverage }) => ({
    request,
    description,
    requesterName:
      (request.requestedBy && requesterNames.get(request.requestedBy)) ?? "a deleted account",
    alreadyApproved: coverage.approvers.some((approver) => approver.id === session.user.id),
    approverNames: coverage.approvers.map((approver) => approver.name),
    missingAreaNames: coverage.missingAreaIds.flatMap((id) => areaNames.get(id) ?? []),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageTitle>Review requests</PageTitle>
        {/* Just the granted areas — each one covers its whole subtree, so
            expanding the tree here would bury the actual grants. */}
        {managedAreas.length > 0 ? (
          <p className="text-sm text-muted">
            Areas you moderate:{" "}
            {managedAreas.map((area, i) => (
              <span key={area.id}>
                {i > 0 && ", "}
                <AppLink href={areaHref(area.id, area.name)} className="text-foreground">
                  {area.name}
                </AppLink>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-sm text-muted">
            You don&apos;t moderate any areas yet — requests will appear here once you&apos;re
            granted one.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No pending requests in your managed areas." />
      ) : (
        <div className="flex flex-col divide-y divide-separator">
          {rows.map(
            ({
              request,
              requesterName,
              description,
              alreadyApproved,
              approverNames,
              missingAreaNames,
            }) => (
              <div
                key={request.id}
                className="flex flex-wrap items-start justify-between gap-3 py-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  {description.href ? (
                    <AppLink href={description.href} className="text-sm font-medium">
                      {description.summary}
                    </AppLink>
                  ) : (
                    <span className="text-sm font-medium text-muted">
                      {description.summary} (no longer exists)
                    </span>
                  )}
                  {description.details.length > 0 && (
                    <ul className="flex flex-col gap-0.5 text-xs text-muted">
                      {description.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                  <span className="text-xs text-muted">
                    Requested by {requesterName} on{" "}
                    {REQUESTED_AT_FORMAT.format(request.requestedAt)}
                  </span>
                  {approverNames.length > 0 && missingAreaNames.length > 0 && (
                    <span className="text-xs text-muted">
                      Approved by {approverNames.join(", ")} — still needs an admin for{" "}
                      {missingAreaNames.join(", ")}
                    </span>
                  )}
                </div>
                <ApproveRejectControls requestId={request.id} alreadyApproved={alreadyApproved} />
              </div>
            ),
          )}
        </div>
      )}
      <nav aria-label="Review queue pages" className="flex gap-4 text-sm">
        {after && <AppLink href="/admin/requests">First requests</AppLink>}
        {nextHref && <AppLink href={nextHref}>Next requests</AppLink>}
      </nav>
    </div>
  );
}
