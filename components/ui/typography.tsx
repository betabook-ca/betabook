import { clsx } from "clsx";
import type { ReactNode } from "react";

/** The guidebook display voice (Barlow Condensed) for page h1s. */
export function PageTitle({
  children,
  className,
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  /** `lg` is the climber name, sized by ProfileHeading's container. */
  size?: "md" | "lg";
}) {
  return (
    <h1
      className={clsx(
        "font-display font-semibold tracking-tight",
        size === "lg" ? "text-4xl leading-none @2xl:text-5xl" : "text-3xl",
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
