import { clsx } from "clsx";
import type { ReactNode } from "react";

/** The list around ListRow and JournalEntryLayout rows: hairline dividers
 * between `li` children. The role is explicit because preflight's
 * list-style:none makes Safari drop list semantics. `ordered` for a list
 * whose order means something, such as a climb list's circuit. */
export function RowList({
  children,
  ordered = false,
  className,
  "aria-label": ariaLabel,
  id,
}: {
  children: ReactNode;
  ordered?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      role="list"
      id={id}
      aria-label={ariaLabel}
      className={clsx("flex flex-col divide-y divide-separator", className)}
    >
      {children}
    </Tag>
  );
}
