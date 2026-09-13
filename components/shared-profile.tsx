import { AscentStyle } from "@/components/ascent-style";
import { ClimbLogRow } from "@/components/climb-log-row";
import { ProfileInvite, SignUpActions } from "@/components/profile-invite";
import { SendGradeCell } from "@/components/send-grade-cell";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SidebarLayout } from "@/components/ui/page-shell";
import { SectionHeading } from "@/components/ui/typography";
import { UserSendSummary } from "@/components/user-send-summary";
import type { AreaBreadcrumbs, UserSendRow, UserStatsSummary } from "@/db/queries";
import { formatCount } from "@/lib/format";

/** Signed-out view of a valid share link. `sends` must come from the
 * null-viewer sends query, which already limits commentary to Everyone. */
export function SharedProfile({
  owner,
  summary,
  sends,
  areaBreadcrumbs,
  next,
}: {
  owner: { name: string; image: string | null };
  summary: UserStatsSummary;
  sends: UserSendRow[];
  areaBreadcrumbs: AreaBreadcrumbs;
  next: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProfileInvite name={owner.name} image={owner.image} next={next} />
      <SidebarLayout sidebar={<UserSendSummary summary={summary} />}>
        <section aria-label="Recent sends" className="flex flex-col gap-3">
          <SectionHeading>Recent sends</SectionHeading>
          {sends.length === 0 ? (
            <EmptyState message={`${owner.name} hasn't logged a send yet.`} />
          ) : (
            <div className="flex flex-col divide-y divide-separator">
              {sends.map((send) => (
                // Keys reach the RSC payload; sequential send ids stay out of it.
                <ClimbLogRow
                  key={send.climbId}
                  climb={{
                    id: send.climbId,
                    name: send.climbName,
                    areaId: send.areaId,
                    areaName: send.areaName,
                  }}
                  areaBreadcrumbs={areaBreadcrumbs}
                  grade={
                    <SendGradeCell
                      type={send.climbType}
                      grade={send.climbGrade}
                      suggestedGrade={send.suggestedGrade}
                      gradeFeel={send.gradeFeel}
                      rating={send.rating}
                    />
                  }
                  status={<AscentStyle type={send.ascentStyle} />}
                  date={send.dateSent}
                  comment={send.comment}
                />
              ))}
            </div>
          )}
        </section>
        <section
          aria-label="Sign up to see more"
          className={`flex flex-col gap-4 ${cardClass("md", "bordered")}`}
        >
          <div className="flex flex-col gap-1">
            <SectionHeading>
              {summary.sendCount > sends.length
                ? `See all ${formatCount(summary.sendCount, "send")}`
                : `Climb with ${owner.name}`}
            </SectionHeading>
            <p className="text-sm text-muted">
              Sign up to send {owner.name} a friend request and see their full logbook, plus
              anything else they share with Betabook members.
            </p>
          </div>
          <SignUpActions next={next} />
        </section>
      </SidebarLayout>
    </div>
  );
}
