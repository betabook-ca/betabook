"use client";

import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";

/** Undefined until the client knows the session (so SSR and hydration match), then the session or null. */
export function useClientSession() {
  const mounted = useMounted();
  const { data, isPending } = authClient.useSession();
  return !mounted || isPending ? undefined : data;
}
