"use client";

import { HintCallout } from "@/components/ui/hint-callout";
import { fetchMountainProjectImport } from "@/lib/mountain-project-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { ImportProfileForm } from "./import-profile-form";

function loadedLabel(bytes: number) {
  if (!bytes) return "Connecting to Mountain Project…";
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-US")} KB of ticks loaded…`;
}

export function MountainProjectImportForm({
  initialUserId = "",
  disabled = false,
  onLoaded,
  onBusyChange,
}: {
  initialUserId?: string;
  disabled?: boolean;
  onLoaded: (parsed: ParsedCsv, label: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  return (
    <ImportProfileForm<number>
      service="Mountain Project"
      initialUsername={initialUserId}
      initialProgress={0}
      disabled={disabled}
      emptyMessage="No ticks found on this Mountain Project profile."
      fetchProfile={fetchMountainProjectImport}
      onLoaded={onLoaded}
      onBusyChange={onBusyChange}
      description="Load the ticks from your Mountain Project profile."
      inputLabel="Mountain Project user ID or profile link"
      placeholder="mountainproject.com/user/123456789/your-name"
      renderHint={() => (
        <HintCallout>
          Open your Mountain Project profile and copy the address from your browser. Your ID is the
          number in it.
        </HintCallout>
      )}
      submitLabel="Load ticks"
      busyLabel="Loading ticks…"
      footnote="Review climb matches before saving. No Mountain Project login needed."
      renderProgress={loadedLabel}
    />
  );
}
