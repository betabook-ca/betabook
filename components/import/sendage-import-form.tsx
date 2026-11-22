"use client";

import { formatCount } from "@/lib/format";
import { fetchSendageImport } from "@/lib/sendage-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { ImportProfileForm } from "./import-profile-form";

function loadedLabel(count: number) {
  return count ? `${formatCount(count, "send")} loaded…` : "Connecting to Sendage…";
}

export function SendageImportForm({
  initialUsername = "",
  disabled = false,
  onLoaded,
  onBusyChange,
}: {
  initialUsername?: string;
  disabled?: boolean;
  onLoaded: (parsed: ParsedCsv, username: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  return (
    <ImportProfileForm<number>
      service="Sendage"
      initialUsername={initialUsername}
      initialProgress={0}
      disabled={disabled}
      emptyMessage="No sends found on this public Sendage profile."
      fetchProfile={fetchSendageImport}
      onLoaded={onLoaded}
      onBusyChange={onBusyChange}
      description="Load your sends from a public Sendage profile."
      inputLabel="Sendage username or profile link"
      placeholder="your-username"
      submitLabel="Load sends"
      busyLabel="Loading sends…"
      footnote="Review climb matches before saving. No Sendage login needed."
      renderProgress={loadedLabel}
    />
  );
}
