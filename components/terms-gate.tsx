"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { TermsAcceptanceForm } from "@/components/terms-acceptance-form";
import type { ActionResult } from "@/lib/action-result";
import { TERMS_REQUIRED_EVENT, TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";
import { isTermsExemptPath } from "@/lib/terms-navigation";

type TermsPrompt = { version: string; versionLabel: string; previousVersion: string | null };

/** The server gates authorize data and writes. This modal pauses the current
 * page without discarding its drafts or navigating to a separate screen. */
export function TermsGate({
  viewerId,
  initiallyRequired,
  version = TERMS_VERSION,
  versionLabel = TERMS_UPDATED_LABEL,
  previousVersion = null,
  children,
  onAccept,
}: {
  viewerId: string | null;
  initiallyRequired: boolean;
  version?: string;
  versionLabel?: string;
  previousVersion?: string | null;
  children: ReactNode;
  onAccept?: (version: unknown, agreed: unknown) => Promise<ActionResult>;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const exempt = isTermsExemptPath(pathname);
  const [prompt, setPrompt] = useState<TermsPrompt | null>(
    initiallyRequired ? { version, versionLabel, previousVersion } : null,
  );
  const [source, setSource] = useState({
    viewerId,
    initiallyRequired,
    version,
    versionLabel,
    previousVersion,
  });
  if (
    source.viewerId !== viewerId ||
    source.initiallyRequired !== initiallyRequired ||
    source.version !== version ||
    source.versionLabel !== versionLabel ||
    source.previousVersion !== previousVersion
  ) {
    setSource({ viewerId, initiallyRequired, version, versionLabel, previousVersion });
    setPrompt(initiallyRequired ? { version, versionLabel, previousVersion } : null);
  }

  useEffect(() => {
    if (!viewerId || exempt || initiallyRequired) return;
    let disposed = false;
    let pending = false;
    let lastChecked = -Infinity;
    const controller = new AbortController();
    const check = async (force = false) => {
      if (pending || document.visibilityState !== "visible") return;
      if (!force && Date.now() - lastChecked < 60_000) return;
      pending = true;
      lastChecked = Date.now();
      try {
        const response = await fetch("/api/terms/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          lastChecked = -Infinity;
          return;
        }
        const status: {
          userId?: unknown;
          required?: unknown;
          version?: unknown;
          versionLabel?: unknown;
          previousVersion?: unknown;
        } = await response.json();
        if (!disposed && status.userId === viewerId && status.required === true) {
          setPrompt({
            version: typeof status.version === "string" ? status.version : version,
            versionLabel:
              typeof status.versionLabel === "string" ? status.versionLabel : versionLabel,
            previousVersion:
              typeof status.previousVersion === "string" ? status.previousVersion : previousVersion,
          });
        }
      } catch {
        // All protected requests still enforce acceptance if this check fails.
        lastChecked = -Infinity;
      } finally {
        pending = false;
      }
    };
    const block = () => {
      if (disposed) return;
      setPrompt((current) => current ?? { version, versionLabel, previousVersion });
      void check(true);
    };
    const focus = () => {
      void check(true);
    };
    const interact = () => {
      void check();
    };
    void check(true);
    window.addEventListener(TERMS_REQUIRED_EVENT, block);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    document.addEventListener("pointerdown", interact, true);
    document.addEventListener("keydown", interact, true);
    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener(TERMS_REQUIRED_EVENT, block);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      document.removeEventListener("pointerdown", interact, true);
      document.removeEventListener("keydown", interact, true);
    };
  }, [viewerId, pathname, exempt, initiallyRequired, version, versionLabel, previousVersion]);

  const open = Boolean(viewerId && !exempt && prompt);
  return (
    <>
      <div
        inert={open || undefined}
        aria-hidden={open || undefined}
        // Initial page loaders intentionally return an anonymous view. Avoid
        // showing its sign-in callout behind an authenticated user's modal.
        className={open && initiallyRequired ? "invisible" : undefined}
      >
        {children}
      </div>
      {open && prompt && (
        <TermsAcceptanceForm
          key={prompt.version}
          {...prompt}
          onAccept={onAccept}
          onAccepted={() => {
            // A response for an older form must not dismiss a newer revision.
            setPrompt((current) => (current?.version === prompt.version ? null : current));
            router.refresh();
          }}
        />
      )}
    </>
  );
}
