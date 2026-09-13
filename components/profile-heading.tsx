import type { ReactNode } from "react";

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

/** Sized by its own width (phone, 17rem side column or page-wide band), so no row ever wraps. */
export function ProfileHeading({
  name,
  image = null,
  overview,
  actions,
  note,
}: {
  name: string;
  image?: string | null;
  overview: ClimberOverview;
  actions?: ReactNode;
  /** Shown under the summary, e.g. why a section is missing. */
  note?: ReactNode;
}) {
  const recency = describeRecency(overview);
  return (
    <div className="@container flex min-w-0 flex-col gap-5 @2xl:gap-4">
      <div className="flex min-w-0 flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between @2xl:gap-6">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 @2xl:gap-x-4 @2xl:gap-y-1.5">
          <UserAvatar
            name={name}
            image={image}
            size="lg"
            className="@max-2xl:size-12 @max-2xl:text-sm @2xl:row-span-2"
          />
          <PageTitle size="lg" className="break-words">
            {name}
          </PageTitle>
          <div className="col-span-2 flex flex-col gap-0.5 text-sm @2xl:col-span-1 @2xl:col-start-2">
            <p className="text-muted">{summarize(overview)}</p>
            {recency && <p>{recency}</p>}
            {note}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 @2xl:shrink-0 @2xl:justify-end">{actions}</div>
        )}
      </div>
      {overview.hardest.length > 0 && (
        <section
          aria-label="Hardest sends"
          className="flex flex-col items-start gap-1.5 @3xl:flex-row @3xl:items-center @3xl:gap-4"
        >
          <h2 className="text-sm text-muted">Hardest sends</h2>
          <dl className="grid grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-1.5 @xs:flex @xs:gap-x-3 @2xl:gap-x-5">
            {overview.hardest.map(({ type, grade, sendCount }) => (
              <div key={type} className="contents @xs:flex @xs:items-center @xs:gap-1.5 @2xl:gap-2">
                <dt>
                  <DisciplineChip type={type} />
                </dt>
                <dd className="text-lg font-semibold tabular-nums">{grade}</dd>
                <dd className="text-sm text-muted tabular-nums @xs:@max-2xl:sr-only">
                  {formatCount(sendCount, "send")}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
