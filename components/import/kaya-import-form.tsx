"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Download } from "lucide-react";

import { HintCallout } from "@/components/ui/hint-callout";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";
import { fetchKayaImport } from "@/lib/kaya-import";
import type { KayaImportProgress as ImportProgress } from "@/lib/kaya-import-stream";
import type { ParsedCsv } from "@/lib/sends-import";

import { KayaImportProgress } from "./kaya-import-progress";
import { useImportProfile } from "./use-import-profile";

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
  const { input, changeInput, busy, progress, error, load, cancel } =
    useImportProfile<ImportProgress>({
      initialUsername,
      initialProgress: { discipline: "boulder", loaded: 0, total: null, retry: null },
      disabled,
      service: "KAYA",
      emptyMessage: "No outdoor boulders or routes found on this public KAYA profile.",
      fetchProfile: fetchKayaImport,
      onLoaded,
      onBusyChange,
    });

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Outdoor boulders and routes from your public KAYA profile.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
        className="flex flex-col gap-4"
      >
        <TextField value={input} onChange={changeInput} isDisabled={busy || disabled} isRequired>
          <Label>KAYA username or profile link</Label>
          <Input placeholder="@your-username" autoComplete="off" spellCheck={false} />
        </TextField>
        <HintCallout>
          Sends import as redpoints only.{" "}
          {onChooseCsv ? (
            <button
              type="button"
              disabled={busy || disabled}
              onClick={onChooseCsv}
              className="rounded-sm font-medium text-foreground underline underline-offset-2 focus-visible:status-focused"
            >
              Use CSV
            </button>
          ) : (
            "Use CSV"
          )}{" "}
          to keep flash and onsight styles.
        </HintCallout>
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            isDisabled={busy || disabled || !input.trim()}
          >
            <Download className="size-4" aria-hidden />
            {busy ? "Loading sends…" : "Load sends"}
          </Button>
          {busy && (
            <Button variant="ghost" onPress={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
      {!busy && (
        <p className="text-xs text-muted">
          No KAYA login needed. Large histories can take a few seconds; you’ll review matches before
          saving.
        </p>
      )}
      {busy && <KayaImportProgress progress={progress} />}
      {error && (
        <InlineAlert>
          <SupportText subject="KAYA import">{error}</SupportText>
        </InlineAlert>
      )}
    </section>
  );
}
