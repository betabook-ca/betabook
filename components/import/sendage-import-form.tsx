"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Download } from "lucide-react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";
import { fetchSendageImport } from "@/lib/sendage-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { useImportProfile } from "./use-import-profile";

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
  const {
    input,
    changeInput,
    busy,
    progress: count,
    error,
    load,
    cancel,
  } = useImportProfile({
    initialUsername,
    initialProgress: 0,
    disabled,
    service: "Sendage",
    emptyMessage: "No sends found on this public Sendage profile.",
    fetchProfile: fetchSendageImport,
    onLoaded,
    onBusyChange,
  });

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
        <TextField value={input} onChange={changeInput} isDisabled={busy || disabled} isRequired>
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
