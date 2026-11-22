"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { Download } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { SupportText } from "@/components/ui/support-text";

import { useImportProfile, type ImportProfileOptions } from "./use-import-profile";

/** The shared shell of the public-profile imports (KAYA, Sendage, Mountain
 * Project): one field, a load button with Cancel beside it while busy, live
 * progress and a support-linked error. Each service fills in its wording and
 * progress display. */
export function ImportProfileForm<Progress>({
  description,
  inputLabel,
  placeholder,
  renderHint,
  submitLabel,
  busyLabel,
  footnote,
  hideFootnoteWhileBusy = false,
  renderProgress,
  ...options
}: ImportProfileOptions<Progress> & {
  description: string;
  inputLabel: string;
  placeholder: string;
  /** Below the field; told whether the form is locked so links inside it can follow. */
  renderHint?: (locked: boolean) => ReactNode;
  submitLabel: string;
  busyLabel: string;
  footnote: ReactNode;
  /** For a service whose progress display repeats the footnote's advice. */
  hideFootnoteWhileBusy?: boolean;
  /** A string renders as the one-line live status. */
  renderProgress: (progress: Progress) => string | ReactElement;
}) {
  const { input, changeInput, busy, progress, error, load, cancel } = useImportProfile(options);
  const locked = busy || options.disabled;
  const status = busy ? renderProgress(progress) : null;

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted">{description}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
        className="flex flex-col gap-4"
      >
        <TextField value={input} onChange={changeInput} isDisabled={locked} isRequired>
          <Label>{inputLabel}</Label>
          <Input placeholder={placeholder} autoComplete="off" spellCheck={false} />
        </TextField>
        {renderHint?.(locked)}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="w-full sm:w-auto" isDisabled={locked || !input.trim()}>
            <Download className="size-4" aria-hidden />
            {busy ? busyLabel : submitLabel}
          </Button>
          {busy && (
            <Button variant="ghost" onPress={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
      {!(busy && hideFootnoteWhileBusy) && <p className="text-xs text-muted">{footnote}</p>}
      {typeof status === "string" ? (
        <p role="status" className="text-sm text-muted">
          {status}
        </p>
      ) : (
        status
      )}
      {error && (
        <InlineAlert>
          <SupportText subject={`${options.service} import`}>{error}</SupportText>
        </InlineAlert>
      )}
    </section>
  );
}
