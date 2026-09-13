import type { ReactNode } from "react";

import { SeasonRidge } from "@/components/season-ridge";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimberOverview } from "@/db/queries/climber-overview";
import { formatCount } from "@/lib/format";

function summarize({ sendCount, areaCount, daysOut, firstYear }: ClimberOverview) {
  const days = daysOut ? formatCount(daysOut, "day out", "days out") : null;
  const log =
    sendCount > 0
      ? `${formatCount(sendCount, "send")} across ${formatCount(areaCount, "area")}${days ? `, ${days}` : ""}.`
      : `No sends logged yet${days ? `, ${days}` : ""}.`;
  return firstYear ? `Climbing since ${firstYear}. ${log}` : log;
}

export function ProfileHeading({
  name,
  image = null,
  overview,
  actions,
  children,
}: {
  name: string;
  image?: string | null;
  overview: ClimberOverview;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex min-w-0 items-center gap-4 xl:flex-col xl:items-start xl:gap-3">
        <UserAvatar name={name} image={image} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <PageTitle size="lg" className="break-words">
            {name}
          </PageTitle>
          <p className="text-sm text-muted">{summarize(overview)}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
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
        <SeasonRidge
          season={overview.season}
          counting={overview.daysOut === null ? "sending days" : "days out"}
        />
      </div>
      {children}
    </div>
  );
}
