"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

import { AppLink } from "./app-link";
import { choicePillClass } from "./choice-pill";

export function SectionNavigation({
  tabs,
  label,
  appearance = "tabs",
}: {
  tabs: readonly ({ label: string; current: boolean; badge?: ReactNode } & (
    | { href: string; onSelect?: never }
    | { id: string; href?: never; onSelect: () => void }
  ))[];
  label: string;
  appearance?: "tabs" | "pills" | "workspace";
}) {
  return (
    <nav
      aria-label={label}
      className={clsx(
        "w-full max-w-full",
        appearance === "tabs" && "overflow-x-auto border-b border-separator",
        appearance === "workspace" && "min-w-0 overflow-x-auto",
      )}
    >
      <div
        className={clsx(
          "flex items-center",
          appearance === "tabs" && "min-w-max gap-6",
          appearance === "workspace" && "min-w-max gap-6 max-[360px]:gap-3",
          appearance === "pills" && "flex-wrap gap-2",
        )}
      >
        {tabs.map((tab) => {
          const current = tab.current;
          const className =
            appearance === "pills"
              ? choicePillClass(current, "bg-foreground text-background")
              : appearance === "workspace"
                ? clsx(
                    "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 py-2 text-xl font-semibold no-underline transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-[''] focus-visible:status-focused max-[360px]:text-lg",
                    current
                      ? "text-foreground after:bg-foreground"
                      : "text-muted after:bg-transparent hover:text-foreground",
                  )
                : clsx(
                    "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 py-2.5 text-sm no-underline transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:content-[''] focus-visible:status-focused",
                    current
                      ? "font-medium text-foreground after:bg-foreground"
                      : "text-muted after:bg-transparent hover:text-foreground",
                  );
          if (tab.onSelect) {
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={current}
                onClick={tab.onSelect}
                className={className}
              >
                {tab.label}
                {tab.badge}
              </button>
            );
          }
          return (
            <AppLink
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={className}
            >
              {tab.label}
              {tab.badge}
            </AppLink>
          );
        })}
      </div>
    </nav>
  );
}
