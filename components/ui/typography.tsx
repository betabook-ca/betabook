import { clsx } from "clsx";
import type { ReactNode } from "react";

/** The guidebook display voice (Barlow Condensed) for page h1s — one
 * canonical treatment so content pages and card pages stop disagreeing
 * about what an h1 looks like. */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={clsx("font-display text-3xl font-semibold tracking-tight", className)}>
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
