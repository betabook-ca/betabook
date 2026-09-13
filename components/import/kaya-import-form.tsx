"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Download, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";
import { fetchKayaImport } from "@/lib/kaya-import";
import type { KayaImportProgress as ImportProgress } from "@/lib/kaya-import-stream";
import type { ParsedCsv } from "@/lib/sends-import";

import { KayaImportProgress } from "./kaya-import-progress";

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
  const [input, setInput] = useState(initialUsername);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({
    discipline: "boulder",
    loaded: 0,
    total: null,
    retry: null,
  });
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    if (active.current || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    onBusyChange(true);
    setProgress({ discipline: "boulder", loaded: 0, total: null, retry: null });
    setError(null);
    try {
      const result = await fetchKayaImport(input, {
        signal: controller.signal,
        onProgress: (value) => {
          if (!controller.signal.aborted) setProgress(value);
        },
      });
      if (controller.signal.aborted) return;
      if (!result.parsed.rows.length) {
        setError("No outdoor boulders or routes found on this public KAYA profile.");
        return;
      }
      setInput(result.username);
      onLoaded(result.parsed, result.username);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't load sends from KAYA. Please try again.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  function cancel() {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    onBusyChange(false);
  }

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
        <TextField
          value={input}
          onChange={(value) => {
            setInput(value);
            setError(null);
          }}
          isDisabled={busy || disabled}
          isRequired
        >
          <Label>KAYA username or profile link</Label>
          <Input placeholder="@your-username" autoComplete="off" spellCheck={false} />
        </TextField>
        <div className="flex items-start gap-2 rounded-lg bg-surface-tertiary px-3 py-2.5 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
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
          </p>
        </div>
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
