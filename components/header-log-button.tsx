"use client";

import { LogEntryButton } from "@/components/journal/log-entry-button";
import { useClientSession } from "@/hooks/use-client-session";

export function HeaderLogButton() {
  return useClientSession() ? <LogEntryButton className="h-11 px-3 md:h-10 md:px-4" /> : null;
}
