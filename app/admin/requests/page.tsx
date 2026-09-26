import type { Metadata } from "next";

import { requireAdminOrRedirect } from "@/app/admin/require-admin";
import { ApproveRejectControls } from "@/components/admin/approve-reject-controls";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getDb } from "@/db/client";
import {
  getAreasByIds,
  getManagedAreas,
  getUsersByIds,
  REVIEW_QUEUE_PAGE_SIZE,
} from "@/db/queries";
import { getReviewQueueDetails } from "@/lib/moderation";
import { getMemberSession } from "@/lib/session";
import { areaHref } from "@/lib/slug";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export const metadata: Metadata = { title: "Review requests" };

const REQUESTED_AT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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
    request,
    description,
    // A deleted account has no row to show a face for, so it stays text-only.
    requester: (request.requestedBy && requestersById.get(request.requestedBy)) ?? null,
    alreadyApproved: coverage.approvers.some((approver) => approver.id === session.user.id),
    approvers: coverage.approvers,
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
            ({ request, requester, description, alreadyApproved, approvers, missingAreaNames }) => (
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
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                    Requested by{" "}
                    {requester ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <UserAvatar
                          name={requester.name}
                          image={requester.image}
                          size="xs"
                          className="size-5"
                        />
                        {requester.name}
                      </span>
                    ) : (
                      "a deleted account"
                    )}{" "}
                    on {REQUESTED_AT_FORMAT.format(request.requestedAt)}
                  </span>
                  {approvers.length > 0 && missingAreaNames.length > 0 && (
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                      Approved by{" "}
                      {approvers.map((approver, index) => (
                        <span key={approver.id} className="inline-flex min-w-0 items-center gap-1">
                          <UserAvatar
                            name={approver.name}
                            image={approver.image}
                            size="xs"
                            className="size-5"
                          />
                          {approver.name}
                          {index < approvers.length - 1 && ","}
                        </span>
                      ))}
                      — still needs an admin for {missingAreaNames.join(", ")}
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
