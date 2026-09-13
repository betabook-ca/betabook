import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimberOverview } from "@/db/queries/climber-overview";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

function summarize({ sendCount, areaCount, daysOut, firstYear }: ClimberOverview) {
  const days = daysOut ? formatCount(daysOut, "day out", "days out") : null;
  const log =
    sendCount > 0
      ? `${formatCount(sendCount, "send")} across ${formatCount(areaCount, "area")}${days ? `, ${days}` : ""}.`
      : `No sends logged yet${days ? `, ${days}` : ""}.`;
  return firstYear ? `Climbing since ${firstYear}. ${log}` : log;
}

function describeRecency({ daysOut, lastOut, daysThisMonth, month }: ClimberOverview) {
  if (!lastOut) return null;
  const journal = daysOut !== null;
  const last = `${journal ? "Last out" : "Last sent"} ${formatDate(lastOut)}.`;
  if (daysThisMonth === 0) return last;
  const days = journal
    ? formatCount(daysThisMonth, "day out", "days out")
    : formatCount(daysThisMonth, "sending day");
  return `${last} ${days} in ${MONTH_NAME.format(new Date(`${month}-01T00:00:00Z`))}.`;
}

export function ProfileHeading({
  name,
  image = null,
  overview,
  analyticsHref,
  actions,
  children,
}: {
  name: string;
  image?: string | null;
  overview: ClimberOverview;
  analyticsHref?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const recency = describeRecency(overview);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex min-w-0 items-center gap-4 xl:flex-col xl:items-start xl:gap-3">
        <UserAvatar name={name} image={image} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <PageTitle size="lg" className="break-words">
            {name}
          </PageTitle>
          <p className="text-sm text-muted">{summarize(overview)}</p>
          {recency && (
            <p className="text-sm">
              {recency}
              {analyticsHref && (
                <>
                  {" "}
                  <AppLink href={analyticsHref}>See analytics</AppLink>
                </>
              )}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
      {overview.hardest.length > 0 && (
        <section aria-label="Hardest sends" className="flex flex-col gap-2">
          <h2 className="text-sm text-muted">Hardest sends</h2>
          <dl className="grid w-fit grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-1.5">
            {overview.hardest.map(({ type, grade, sendCount }) => (
              <div key={type} className="contents">
                <dt>
                  <DisciplineChip type={type} />
                </dt>
                <dd className="text-xl font-semibold tabular-nums">{grade}</dd>
                <dd className="text-sm text-muted tabular-nums">
                  {formatCount(sendCount, "send")}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {children}
    </div>
  );
}
