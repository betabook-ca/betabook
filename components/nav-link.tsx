"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { AppLink } from "@/components/ui/app-link";

type NavLinkProps = Omit<ComponentProps<typeof AppLink>, "href"> & {
  href: string;
  appearance?: "link" | "primary";
  layout?: "header" | "menu";
  /** Keep a top-level destination active on its child pages. */
  matchWithin?: boolean;
  /** Related pages outside the destination's URL subtree. */
  relatedPaths?: readonly string[];
};

/** Persistent navigation links with a visible, accessible current destination. */
export function NavLink({
  href,
  appearance = "link",
  layout = "header",
  matchWithin = false,
  relatedPaths,
  className,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  const exact = pathname === href;
  const within =
    (matchWithin && pathname.startsWith(`${href}/`)) || relatedPaths?.includes(pathname);
  return (
    <AppLink
      href={href}
      aria-current={exact ? "page" : within ? "location" : undefined}
      className={clsx(
        appearance === "primary"
          ? [
              "inline-flex items-center px-3 py-2 text-sm no-underline transition-colors hover:no-underline",
              layout === "menu" ? "w-full rounded-lg" : "rounded-full whitespace-nowrap",
              exact || within
                ? "bg-navigation-active font-semibold text-link"
                : "text-muted hover:bg-default hover:text-foreground",
            ]
          : "aria-[current=location]:underline aria-[current=location]:underline-offset-4 aria-[current=page]:underline aria-[current=page]:underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}
