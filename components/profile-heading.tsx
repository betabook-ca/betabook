import { clsx } from "clsx";
import type { ReactNode } from "react";

import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { HardestSend } from "@/db/queries/climber-overview";

/** Sized by its own width (phone, 17rem side column or page-wide band), so no row ever wraps.
 * The badge padding is tight enough for 5.15d, 5.15d and V17 to share a row in the side column. */
export function ProfileHeading({
  name,
  image = null,
  hardest,
  nameAction,
  note,
}: {
  name: string;
  image?: string | null;
  hardest: HardestSend[];
  /** Keeps the visitor's friendship control beside the climber's name. */
  nameAction?: ReactNode;
  /** Shown under the badges, e.g. why a section is missing. */
  note?: ReactNode;
}) {
  return (
    <div className="@container min-w-0">
      {/* Rows are spaced by margins so an absent note adds no height. */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 @2xl:gap-x-4">
        <UserAvatar
          name={name}
          image={image}
          size="lg"
          className="@max-2xl:size-12 @max-2xl:text-sm @xs:row-span-3"
        />
        <div className="flex min-w-0 items-center gap-1">
          <PageTitle size="lg" className="min-w-0 break-words">
            {name}
          </PageTitle>
          {nameAction}
        </div>
        {hardest.length > 0 && (
          <section
            aria-label="Hardest sends"
            className="col-span-2 mt-3 @xs:col-span-1 @xs:col-start-2 @xs:mt-1.5 @2xl:mt-2"
          >
            <ul className="flex flex-wrap gap-1.5 @2xl:gap-2">
              {hardest.map(({ type, grade }) => (
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
    </div>
  );
}
