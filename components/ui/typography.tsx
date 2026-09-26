import { clsx } from "clsx";
import type { ReactNode } from "react";

const PAGE_TITLE_SIZE = {
  /** A dialog's visible heading, behind ResponsiveDialog's hidden title. */
  sm: "text-2xl",
  md: "text-3xl",
  /** The climber name, sized by ProfileHeading's container. */
  lg: "text-4xl leading-none @2xl:text-5xl",
} as const;

/** The guidebook display voice (Barlow Condensed) for page h1s. */
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
        "font-display font-semibold tracking-tight",
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
    <h2 id={id} className={clsx("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
}
