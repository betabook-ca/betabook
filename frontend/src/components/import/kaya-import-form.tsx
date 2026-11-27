"use client";

import { HintCallout } from "@/components/ui/hint-callout";
import { fetchKayaImport } from "@/lib/kaya-import";
import type { KayaImportProgress as ImportProgress } from "@/lib/kaya-import-stream";
import type { ParsedCsv } from "@/lib/sends-import";

import { ImportProfileForm } from "./import-profile-form";
import { KayaImportProgress } from "./kaya-import-progress";
import { TEXT_BUTTON_CLASS } from "./text-button";

const INITIAL_PROGRESS: ImportProgress = {
  discipline: "boulder",
  loaded: 0,
  total: null,
  retry: null,
};

export function KayaImportForm({
  initialUsername = "",
  disabled = false,
  onLoaded,
  onBusyChange,
  onChooseCsv,
}: {
  initialUsername?: string;
  disabled?: boolean;
  onLoaded: (parsed: ParsedCsv, username: string) => void;
  onBusyChange: (busy: boolean) => void;
  onChooseCsv?: () => void;
}) {
  return (
    <ImportProfileForm<ImportProgress>
      service="KAYA"
      initialUsername={initialUsername}
      initialProgress={INITIAL_PROGRESS}
      disabled={disabled}
      emptyMessage="No outdoor boulders or routes found on this public KAYA profile."
      fetchProfile={fetchKayaImport}
      onLoaded={onLoaded}
      onBusyChange={onBusyChange}
      description="Outdoor boulders and routes from your public KAYA profile."
      inputLabel="KAYA username or profile link"
      placeholder="@your-username"
      renderHint={(locked) => (
        <HintCallout>
          Sends import as redpoints only.{" "}
          {onChooseCsv ? (
            <button
              type="button"
              disabled={locked}
              onClick={onChooseCsv}
              className={TEXT_BUTTON_CLASS}
            >
              Use CSV
            </button>
          ) : (
            "Use CSV"
          )}{" "}
          to keep flash and onsight styles.
        </HintCallout>
      )}
      submitLabel="Load sends"
      busyLabel="Loading sends…"
      // The progress panel repeats this advice while loading.
      footnote="No KAYA login needed. Large histories can take a few seconds; you’ll review matches before saving."
      hideFootnoteWhileBusy
      renderProgress={(progress) => <KayaImportProgress progress={progress} />}
    />
  );
}
