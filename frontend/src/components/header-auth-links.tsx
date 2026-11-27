"use client";

import { buttonVariants } from "@heroui/styles";

import { NavLink } from "@/components/nav-link";
import { AppLink } from "@/components/ui/app-link";
import { useClientSession } from "@/hooks/use-client-session";

/** Sign-up stays in the header on every screen; narrow screens leave sign-in to the menu.
 * Signed-in climbers use Account settings in the sidebar or mobile menu. */
export function HeaderAuthLinks() {
  if (useClientSession() !== null) return null;

  return (
    <span className="flex items-center gap-4 text-sm">
      <NavLink href="/sign-in" className="hidden min-h-10 min-w-11 items-center md:inline-flex">
        Sign in
      </NavLink>
      <AppLink href="/sign-up" className={`${buttonVariants()} h-11 px-3 md:h-10 md:px-4`}>
        Sign up
      </AppLink>
    </span>
  );
}
