"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Download } from "lucide-react";

import { HintCallout } from "@/components/ui/hint-callout";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";
import { fetchMountainProjectImport } from "@/lib/mountain-project-import";
import type { ParsedCsv } from "@/lib/sends-import";

import { useImportProfile } from "./use-import-profile";

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
  const {
    input,
    changeInput,
    busy,
    progress: bytes,
    error,
    load,
    cancel,
  } = useImportProfile<number>({
    initialUsername: initialUserId,
    initialProgress: 0,
    disabled,
    service: "Mountain Project",
    emptyMessage: "No ticks found on this Mountain Project profile.",
    fetchProfile: fetchMountainProjectImport,
    onLoaded,
    onBusyChange,
  });

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted">Load the ticks from your Mountain Project profile.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
        className="flex flex-col gap-4"
      >
        <TextField value={input} onChange={changeInput} isDisabled={busy || disabled} isRequired>
          <Label>Mountain Project user ID or profile link</Label>
          <Input
            placeholder="mountainproject.com/user/123456789/your-name"
            autoComplete="off"
            spellCheck={false}
          />
        </TextField>
        <HintCallout>
          Open your Mountain Project profile and copy the address from your browser. Your ID is the
          number in it.
        </HintCallout>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            isDisabled={busy || disabled || !input.trim()}
          >
            <Download className="size-4" aria-hidden />
            {busy ? "Loading ticks…" : "Load ticks"}
          </Button>
          {busy && (
            <Button variant="ghost" onPress={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
      <p className="text-xs text-muted">
        Review climb matches before saving. No Mountain Project login needed.
      </p>
      {busy && (
        <p role="status" className="text-sm text-muted">
          {loadedLabel(bytes)}
        </p>
      )}
      {error && (
        <InlineAlert>
          <SupportText subject="Mountain Project import">{error}</SupportText>
        </InlineAlert>
      )}
    </section>
  );
}
