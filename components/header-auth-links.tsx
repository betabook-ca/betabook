"use client";

import { NavLink } from "@/components/nav-link";
import { useClientSession } from "@/hooks/use-client-session";

/** Signed-in climbers reach their account through the menu instead. */
export function HeaderAuthLinks() {
  if (useClientSession() !== null) return null;

  return (
    <span className="flex items-center gap-4 text-sm">
      <NavLink href="/sign-in">Sign in</NavLink>
      <NavLink href="/sign-up">Sign up</NavLink>
    </span>
  );
}
