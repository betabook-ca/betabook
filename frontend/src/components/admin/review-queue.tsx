import { ApproveRejectControls } from "@/components/admin/approve-reject-controls";
import { AppLink } from "@/components/ui/app-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { areaHref } from "@/lib/slug";

type Person = { name: string; image: string | null };
export type ReviewQueueData = {
  managedAreas: { id: number; name: string }[];
  rows: {
    id: number;
    requestedAt: number;
    requester: Person | null;
    description: { href: string | null; summary: string; details: string[] };
    alreadyApproved: boolean;
    approvers: (Person & { id: string })[];
    missingAreaNames: string[];
  }[];
  nextHref: string | null;
  hasPrevious: boolean;
};

const REQUESTED_AT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function ReviewQueue({
  managedAreas,
  rows,
  nextHref,
  hasPrevious,
  pending = false,
}: ReviewQueueData & { pending?: boolean }) {
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

      {pending ? (
        <div aria-busy="true" aria-label="Loading review requests">
          <SkeletonListRows rows={4} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message="No pending requests in your managed areas." />
      ) : (
        <div className="flex flex-col divide-y divide-separator">
          {rows.map(
            ({
              id,
              requestedAt,
              requester,
              description,
              alreadyApproved,
              approvers,
              missingAreaNames,
            }) => (
              <div key={id} className="flex flex-wrap items-start justify-between gap-3 py-4">
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
                    on {REQUESTED_AT_FORMAT.format(requestedAt)}
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
                <ApproveRejectControls requestId={id} alreadyApproved={alreadyApproved} />
              </div>
            ),
          )}
        </div>
      )}
      <nav aria-label="Review queue pages" className="flex gap-4 text-sm">
        {hasPrevious && <AppLink href="/admin/requests">First requests</AppLink>}
        {nextHref && <AppLink href={nextHref}>Next requests</AppLink>}
      </nav>
    </div>
  );
}
