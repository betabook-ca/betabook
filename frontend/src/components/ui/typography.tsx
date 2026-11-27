import { clsx } from "clsx";
import type { ReactNode } from "react";

const PAGE_TITLE_SIZE = {
  /** A dialog's visible heading, behind ResponsiveDialog's hidden title. */
  sm: "text-2xl",
  md: "text-3xl sm:text-4xl",
  /** The climber name, sized by ProfileHeading's container. */
  lg: "text-3xl leading-none @2xl:text-4xl",
} as const;

/** The field-guide display face for page h1s. */
export function PageTitle({
  children,
  className,
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  size?: keyof typeof PAGE_TITLE_SIZE;
}) {
  return (
    <h1
      className={clsx(
        "font-display leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]",
        PAGE_TITLE_SIZE[size],
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** Canonical section h2 ("Results", "Climbs", "Sends", …). */
export function SectionHeading({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className={clsx("font-display text-xl leading-tight font-semibold tracking-tight", className)}
    >
      {children}
    </h2>
  );
}
