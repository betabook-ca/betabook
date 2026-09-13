"use client";

import { LogEntryButton } from "@/components/journal/log-entry-button";
import { useMounted } from "@/hooks/use-mounted";
import { authClient } from "@/lib/auth-client";

export function HeaderLogButton() {
  const mounted = useMounted();
  const { data: session, isPending } = authClient.useSession();
  if (!mounted || isPending || !session) return null;

  return <LogEntryButton size="sm" />;
}
