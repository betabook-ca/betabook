"use client";

import { NavLink } from "@/components/nav-link";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";

/** Signed-in climbers reach their account through the menu instead. */
export function HeaderAuthLinks() {
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  if (!mounted || isPending || session) return null;

  return (
    <span className="flex items-center gap-4 text-sm">
      <NavLink href="/sign-in">Sign in</NavLink>
      <NavLink href="/sign-up">Sign up</NavLink>
    </span>
  );
}
