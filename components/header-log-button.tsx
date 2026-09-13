"use client";

import { LogEntryButton } from "@/components/journal/log-entry-button";
import { useClientSession } from "@/hooks/use-client-session";

export function HeaderLogButton() {
  return useClientSession() ? <LogEntryButton size="sm" /> : null;
}
