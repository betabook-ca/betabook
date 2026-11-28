import { clsx } from "clsx";
import type { ReactNode } from "react";

/** The letterspaced micro-label treatment, as a class for inline spots
 * (stat labels, list section headings) that can't take the block element. */
export const EYEBROW_CLASS = "text-xs font-medium tracking-widest text-muted uppercase";

type EyebrowProps = {
  children: ReactNode;
  className?: string;
  /** A heading level when the label titles the content below it, such as a
   * chart card or a list section; the default `div` only names a page's kind. */
  as?: "div" | "h2" | "h3";
  id?: string;
};

/** The letterspaced micro-label that names what kind of thing a page or
 * card is about ("AREA", "CLIMB", "CLIMBER", "ASCENT BREAKDOWN") — the one
 * eyebrow treatment everywhere. */
export function Eyebrow({ children, className, as: Tag = "div", id }: EyebrowProps) {
  return (
    <Tag id={id} className={clsx("flex items-center gap-2", EYEBROW_CLASS, className)}>
      {children}
    </Tag>
  );
}

/** The header of a chart or stat card: an eyebrow title, an optional one-line
 * description, and optional controls aligned to its end. */
export function PanelHeader({
  title,
  description,
  actions,
  as = "h3",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  const text = (
    <div className="flex flex-col gap-1">
      <Eyebrow as={as}>{title}</Eyebrow>
      {description && <p className="text-xs text-muted">{description}</p>}
    </div>
  );
  if (!actions) return <div className={clsx("mb-4", className)}>{text}</div>;
  return (
    <div className={clsx("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      {text}
      {actions}
    </div>
  );
}
