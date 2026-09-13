import type { ReactNode } from "react";

import { DISCIPLINE_HUE, DISCIPLINE_LABELS, DisciplineChip } from "@/components/ui/discipline-chip";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimberOverview } from "@/db/queries/climber-overview";

const count = (value: number) => value.toLocaleString("en-US");

/** The discipline bar reads with the hardest-sends chips below it, which share its colors. */
function SendTally({ sendCount, hardest }: Pick<ClimberOverview, "sendCount" | "hardest">) {
  const counted = hardest.reduce((sum, discipline) => sum + discipline.sendCount, 0);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 @max-xs:w-full @max-xs:items-start">
      <p className="text-sm text-muted">
        <span className="font-display text-2xl font-semibold text-foreground tabular-nums">
          {count(sendCount)}
        </span>{" "}
        {sendCount === 1 ? "send" : "sends"}
      </p>
      {counted > 0 && (
        <>
          <div aria-hidden className="flex h-1.5 w-24 gap-0.5">
            {hardest.map(({ type, sendCount: disciplineCount }) => (
              <span
                key={type}
                className="h-full rounded-full"
                style={{
                  width: `${(disciplineCount / counted) * 100}%`,
                  backgroundColor: DISCIPLINE_HUE[type],
                }}
              />
            ))}
          </div>
          <span className="sr-only">
            {hardest
              .map(
                ({ type, sendCount: disciplineCount }) =>
                  `${count(disciplineCount)} ${DISCIPLINE_LABELS[type].toLowerCase()}`,
              )
              .join(", ")}
          </span>
        </>
      )}
    </div>
  );
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
  /** Shown under the name, e.g. why a section is missing. */
  note?: ReactNode;
}) {
  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3 @2xl:flex-nowrap @2xl:gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 @2xl:flex-none @2xl:gap-4">
            <UserAvatar
              name={name}
              image={image}
              size="lg"
              className="@max-2xl:size-12 @max-2xl:text-sm"
            />
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <PageTitle size="lg" className="break-words">
                {name}
              </PageTitle>
              {note}
            </div>
          </div>
          {overview.sendCount > 0 && (
            <SendTally sendCount={overview.sendCount} hardest={overview.hardest} />
          )}
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
          <dl className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 @xs:flex @xs:gap-x-4 @2xl:gap-x-5">
            {overview.hardest.map(({ type, grade }) => (
              <div key={type} className="contents @xs:flex @xs:items-center @xs:gap-1.5 @2xl:gap-2">
                <dt>
                  <DisciplineChip type={type} />
                </dt>
                <dd className="text-lg font-semibold tabular-nums">{grade}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
