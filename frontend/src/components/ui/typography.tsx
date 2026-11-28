import { clsx } from "clsx";
import type { ReactNode } from "react";

const PAGE_TITLE_SIZE = {
  /** A dialog's visible heading, behind ResponsiveDialog's hidden title. */
  sm: "text-2xl",
  md: "text-3xl sm:text-4xl",
  /** The climber name, sized by ProfileHeading's container. */
  lg: "text-3xl leading-none @2xl:text-4xl",
} as const;

/** The field-guide display face for page h1s. `as="h2"` keeps the look for
 * an entity title inside a page that already supplies the h1, such as a
 * trip header. */
export function PageTitle({
  children,
  className,
  size = "md",
  as: Tag = "h1",
}: {
  children: ReactNode;
  className?: string;
  size?: keyof typeof PAGE_TITLE_SIZE;
  as?: "h1" | "h2";
}) {
  return (
    <Tag
      className={clsx(
        "font-display leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]",
        PAGE_TITLE_SIZE[size],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** The section heading treatment, as a class for headings that a component
 * library renders itself (a disclosure trigger). */
export const SECTION_HEADING_CLASS =
  "font-display text-xl leading-tight font-semibold tracking-tight";

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
    <h2 id={id} className={clsx(SECTION_HEADING_CLASS, className)}>
      {children}
    </h2>
  );
}

const SUBSECTION_HEADING_SIZE = {
  /** A titled block in running content: a landing-page feature, a FAQ item. */
  md: "text-base",
  /** A titled group inside a card: a trip day, a helper panel. */
  sm: "text-sm",
} as const;

/** The h3 below a SectionHeading: body face, semibold. Use Eyebrow for the
 * letterspaced label that names a chart or stat card, and a row's own title
 * treatment for a climb name. */
export function SubsectionHeading({
  children,
  className,
  id,
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  size?: keyof typeof SUBSECTION_HEADING_SIZE;
}) {
  return (
    <h3
      id={id}
      className={clsx("font-semibold text-foreground", SUBSECTION_HEADING_SIZE[size], className)}
    >
      {children}
    </h3>
  );
}
