"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { TermsAcceptanceForm } from "@/components/terms/terms-acceptance-form";
import type { ActionResult } from "@/lib/action-result";
import { TERMS_REQUIRED_EVENT, TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";
import { isTermsExemptPath } from "@/lib/terms-navigation";
import { fetchApi } from "@/spa/lib/api";
import { usePathname, useRouter, useSearchParams } from "@/spa/lib/navigation";

const TermsPendingContext = createContext(false);

/** Whether the viewer has terms to accept (the gate is open). Page loaders
 * treat such a viewer as signed out until they do, so client-drawn member UI
 * (a loading state's workspace tabs) should too. The gate stays shut on the
 * exempt pages, which have no member navigation to hide. */
export function useTermsPending(): boolean {
  return useContext(TermsPendingContext);
}

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
  const exempt = isTermsExemptPath(pathname, useSearchParams());
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
    const controller = new AbortController();
    // Only a denied request asks the server. Clicks and keys don't: a
    // navigation re-renders the template, which checks terms on the server,
    // and a second request on the same click would only compete with it for
    // the Worker and D1. Nor does a return to the tab: the viewer boundary
    // refreshes the route then, and this gate re-renders with the answer.
    const check = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const status = await fetchApi("/api/terms/status", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!disposed && status.userId === viewerId && status.required) {
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
      } finally {
        pending = false;
      }
    };
    const block = () => {
      if (disposed) return;
      setPrompt((current) => current ?? { version, versionLabel, previousVersion });
      void check();
    };
    window.addEventListener(TERMS_REQUIRED_EVENT, block);
    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener(TERMS_REQUIRED_EVENT, block);
    };
  }, [viewerId, exempt, initiallyRequired, version, versionLabel, previousVersion]);

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
        <TermsPendingContext value={open}>{children}</TermsPendingContext>
      </div>
      {open && prompt && (
        <TermsAcceptanceForm
          key={prompt.version}
          {...prompt}
          onAccept={onAccept}
          onAccepted={() => {
            // A response for an older form must not dismiss a newer revision.
            setPrompt((current) => (current?.version === prompt.version ? null : current));
            // The production action already invalidates page data. An injected
            // save function still needs the gate to do that on its behalf.
            if (onAccept) router.refresh();
          }}
        />
      )}
    </>
  );
}
