import { clsx } from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

type GradeProps = {
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

/** The one grade treatment everywhere a grade is printed: the site's own
 * face at medium weight — no box, no font change — so a grade reads the
 * same in a route row, a send row, and a climb header. */
export function Grade({ children, size = "sm", className }: GradeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 font-medium text-foreground",
        size === "sm" ? "text-sm" : "text-base",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The one arrow beside a grade, whatever is being compared to the posted
 * grade: up always means "harder than posted", down "softer". The community
 * trend (climb rows) and a single climber's feel (send rows) both use it,
 * so the reader learns one sign instead of two glyph families. */
export function GradeArrow({ direction, label }: { direction: "up" | "down"; label: string }) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return <Icon className="size-3.5 text-muted" aria-label={label} />;
}

/** A grade compared against the one it sits beside — the community's or a
 * climber's suggestion in parentheses. The arrow lives inside them, next to
 * the grade it qualifies, and the group never wraps: as a bare sibling the
 * icon is a block inside a plain span and drops to its own line in a narrow
 * stat column. */
export function GradeSuggestion({ children, arrow }: { children: ReactNode; arrow?: ReactNode }) {
  return (
    <span className="ml-0.5 inline-flex items-center font-normal whitespace-nowrap text-muted">
      ({children}
      {arrow})
    </span>
  );
}
