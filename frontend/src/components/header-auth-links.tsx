"use client";

import { NavLink } from "@/components/nav-link";
import { useClientSession } from "@/hooks/use-client-session";

/** Signed-in climbers use Account settings in the sidebar or mobile menu. */
export function HeaderAuthLinks() {
  if (useClientSession() !== null) return null;

  return (
    <span className="flex items-center gap-2 text-sm sm:gap-4">
      <NavLink href="/sign-in" className="inline-flex min-h-10 min-w-11 items-center">
        Sign in
      </NavLink>
      <NavLink href="/sign-up" className="inline-flex min-h-10 min-w-11 items-center">
        Sign up
      </NavLink>
    </span>
  );
}
