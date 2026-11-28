"use client";

import { buttonVariants } from "@heroui/styles";

import { NavLink } from "@/components/app-shell/nav-link";
import { AppLink } from "@/components/ui/app-link";
import { useClientSession } from "@/hooks/use-client-session";

/** Narrow screens keep one Sign in button so Search keeps its width; the sign-in
 * page offers Google account creation and links to sign-up.
 * Signed-in climbers use Account settings in the sidebar or mobile menu. */
export function HeaderAuthLinks() {
  if (useClientSession() !== null) return null;

  return (
    <span className="flex items-center gap-4 text-sm">
      <AppLink href="/sign-in" className={`${buttonVariants()} h-11 px-3 md:hidden`}>
        Sign in
      </AppLink>
      <NavLink href="/sign-in" className="hidden min-h-10 min-w-11 items-center md:inline-flex">
        Sign in
      </NavLink>
      <AppLink href="/sign-up" className={`${buttonVariants()} hidden h-10 px-4 md:inline-flex`}>
        Sign up
      </AppLink>
    </span>
  );
}
