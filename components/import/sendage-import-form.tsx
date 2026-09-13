"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";
import { fetchSendageImport } from "@/lib/sendage-import";
import type { ParsedCsv } from "@/lib/sends-import";

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
  const [input, setInput] = useState(initialUsername);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    if (active.current || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    onBusyChange(true);
    setCount(0);
    setError(null);
    try {
      const result = await fetchSendageImport(input, {
        signal: controller.signal,
        onProgress: (value) => {
          if (!controller.signal.aborted) setCount(value);
        },
      });
      if (controller.signal.aborted) return;
      if (!result.parsed.rows.length) {
        setError("No sends found on this public Sendage profile.");
        return;
      }
      setInput(result.username);
      onLoaded(result.parsed, result.username);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't load sends from Sendage. Please try again.",
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
      <p className="text-sm text-muted">Load your sends from a public Sendage profile.</p>
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
          <Label>Sendage username or profile link</Label>
          <Input placeholder="your-username" autoComplete="off" spellCheck={false} />
        </TextField>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            className="w-full sm:w-auto"
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
      <p className="text-xs text-muted">
        Review climb matches before saving. No Sendage login needed.
      </p>
      {busy && (
        <p role="status" className="text-sm text-muted">
          {count ? `${count} sends loaded…` : "Connecting to Sendage…"}
        </p>
      )}
      {error && (
        <InlineAlert>
          <SupportText subject="Sendage import">{error}</SupportText>
        </InlineAlert>
      )}
    </section>
  );
}
