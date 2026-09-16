"use client";

import { useEffect, useRef, useState } from "react";

import type { ParsedCsv } from "@/lib/sends-import";

export function useImportProfile<Progress>({
  initialUsername,
  initialProgress,
  disabled,
  service,
  emptyMessage,
  fetchProfile,
  onLoaded,
  onBusyChange,
}: {
  initialUsername: string;
  initialProgress: Progress;
  disabled: boolean;
  service: "KAYA" | "Sendage" | "Mountain Project";
  emptyMessage: string;
  fetchProfile: (
    input: string,
    options: { signal: AbortSignal; onProgress: (progress: Progress) => void },
  ) => Promise<{ username: string; parsed: ParsedCsv; displayName?: string }>;
  /** The handle, unless the service reports its own display name. */
  onLoaded: (parsed: ParsedCsv, label: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [input, setInput] = useState(initialUsername);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(initialProgress);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    if (active.current || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    onBusyChange(true);
    setProgress(initialProgress);
    setError(null);
    try {
      const result = await fetchProfile(input, {
        signal: controller.signal,
        onProgress: (value) => {
          if (!controller.signal.aborted) setProgress(value);
        },
      });
      if (controller.signal.aborted) return;
      if (!result.parsed.rows.length) {
        setError(emptyMessage);
        return;
      }
      setInput(result.username);
      onLoaded(result.parsed, result.displayName ?? `@${result.username}`);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : `Couldn't load sends from ${service}. Please try again.`,
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

  function changeInput(value: string) {
    setInput(value);
    setError(null);
  }

  return { input, changeInput, busy, progress, error, load, cancel };
}
