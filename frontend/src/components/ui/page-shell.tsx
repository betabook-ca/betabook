import { clsx } from "clsx";
import type { ReactNode } from "react";

type SidebarLayoutProps = {
  /** The filter/stat column. On narrow screens it stacks above the main
   * content (filters lead); from lg it becomes a fixed-width side column. */
  sidebar: ReactNode;
  children: ReactNode;
  /** Tailwind width classes for the sidebar column at lg+ ("lg:w-80"). */
  sidebarWidthClass?: string;
  /** Which side the sidebar sits on at lg+. */
  side?: "left" | "right";
  className?: string;
};

/** The two-column entity-page layout (area, climb, user) — one shared
 * implementation of the stack-then-split pattern, so every page that puts
 * a stats or index column beside its main list breaks the same way. */
export function SidebarLayout({
  sidebar,
  children,
  sidebarWidthClass = "lg:w-80",
  side = "right",
  className,
}: SidebarLayoutProps) {
  return (
    <div className={clsx("flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8", className)}>
      <div
        className={clsx(
          "flex min-w-0 flex-1 flex-col gap-6",
          side === "right" ? "order-2 lg:order-1" : "order-2",
        )}
      >
        {children}
      </div>
      <div
        className={clsx(
          "order-1 flex flex-col gap-4 lg:shrink-0",
          side === "right" && "lg:order-2",
          sidebarWidthClass,
        )}
      >
        {sidebar}
      </div>
    </div>
  );
}
