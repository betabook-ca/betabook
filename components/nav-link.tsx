"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { AppLink } from "@/components/ui/app-link";

type NavMatch = {
  /** Keep a top-level destination active on its child pages. */
  matchWithin?: boolean;
  /** Related pages outside the destination's URL subtree. */
  relatedPaths?: readonly string[];
};

type NavLinkProps = Omit<ComponentProps<typeof AppLink>, "href"> &
  NavMatch & {
    href: string;
    appearance?: "link" | "menu" | "tab";
  };

/** Shared by menu links and the menu's own buttons. */
export const MENU_ROW_CLASS = "w-full gap-3 rounded-lg px-3 py-2 text-sm";
export const MENU_ROW_IDLE_CLASS = "text-muted hover:bg-default hover:text-foreground";

export function navCurrent(
  pathname: string,
  href: string,
  { matchWithin = false, relatedPaths }: NavMatch = {},
): "page" | "location" | undefined {
  if (pathname === href) return "page";
  if ((matchWithin && pathname.startsWith(`${href}/`)) || relatedPaths?.includes(pathname)) {
    return "location";
  }
  return undefined;
}

/** Persistent navigation links with a visible, accessible current destination. */
export function NavLink({
  href,
  appearance = "link",
  matchWithin,
  relatedPaths,
  className,
  ...props
}: NavLinkProps) {
  const current = navCurrent(usePathname(), href, { matchWithin, relatedPaths });
  return (
    <AppLink
      href={href}
      aria-current={current}
      className={clsx(
        appearance === "menu" && [
          "inline-flex items-center no-underline transition-colors hover:no-underline",
          MENU_ROW_CLASS,
          current ? "bg-navigation-active font-semibold text-link" : MENU_ROW_IDLE_CLASS,
        ],
        appearance === "tab" && [
          "flex size-full flex-col items-center justify-center gap-1 text-xs no-underline transition-colors hover:no-underline",
          current ? "font-semibold text-link" : "text-muted hover:text-foreground",
        ],
        appearance === "link" &&
          "aria-[current=location]:underline aria-[current=location]:underline-offset-4 aria-[current=page]:underline aria-[current=page]:underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}
