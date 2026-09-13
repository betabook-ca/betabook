import { clsx } from "clsx";
import type { ReactNode } from "react";

import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ClimberOverview } from "@/db/queries/climber-overview";

/** Sized by its own width (phone, 17rem side column or page-wide band), so no row ever wraps.
 * The badge padding is tight enough for 5.15d, 5.15d and V17 to share a row in the side column. */
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
  /** Shown under the badges, e.g. why a section is missing. */
  note?: ReactNode;
}) {
  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-6">
        {/* Rows are spaced by margins so an absent note adds no height. */}
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 @2xl:gap-x-4">
          <UserAvatar
            name={name}
            image={image}
            size="lg"
            className="@max-2xl:size-12 @max-2xl:text-sm @xs:row-span-3"
          />
          <PageTitle size="lg" className="break-words">
            {name}
          </PageTitle>
          {overview.hardest.length > 0 && (
            <section
              aria-label="Hardest sends"
              className="col-span-2 mt-3 @xs:col-span-1 @xs:col-start-2 @xs:mt-1.5 @2xl:mt-2"
            >
              <ul className="flex flex-wrap gap-1.5 @2xl:gap-2">
                {overview.hardest.map(({ type, grade }) => (
                  <li
                    key={type}
                    className={clsx(
                      "inline-flex items-baseline gap-1 rounded-full px-1.5 py-0.5 whitespace-nowrap @2xl:px-2.5",
                      DISCIPLINE_CHIP_CLASSNAME[type],
                    )}
                  >
                    <span className="text-xs leading-5 font-medium">{DISCIPLINE_LABELS[type]}</span>
                    <span className="text-sm leading-5 font-semibold text-foreground tabular-nums @2xl:text-base @2xl:leading-6">
                      {grade}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {note && (
            <div className="col-span-2 mt-1.5 text-sm @xs:col-span-1 @xs:col-start-2">{note}</div>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 @2xl:shrink-0 @2xl:justify-end">{actions}</div>
        )}
      </div>
    </div>
  );
}
