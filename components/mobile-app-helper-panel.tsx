"use client";

import { Button } from "@heroui/react";
import { Download, MoreVertical, Share, X } from "lucide-react";

import { Brand } from "@/components/brand";
import { cardClass } from "@/components/ui/card";
import { detectMobileBrowser, detectMobilePlatform } from "@/lib/mobile-detection";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function MobileAppHelperPanel({
  installPrompt,
  onDismiss,
  onNativeInstall,
}: {
  installPrompt: BeforeInstallPromptEvent | null;
  onDismiss: () => void;
  onNativeInstall: () => void;
}) {
  const platform = detectMobilePlatform();
  const detectedBrowser = detectMobileBrowser();
  const isIOS = platform === "ios";

  return (
    <aside
      aria-label="Add Betabook to Home Screen"
      className={`fixed inset-x-4 floating-panel-bottom z-40 mx-auto max-w-md sm:inset-x-auto sm:right-6 sm:max-w-sm ${cardClass("sm", "floating")}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="shrink-0 rounded-xl border border-border bg-background">
            <Brand className="size-12" decorative />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add to Home Screen</h3>
            <p className="text-xs text-muted">
              {isIOS ? "Create an iOS app shortcut" : "Create an Android app shortcut"}
            </p>
          </div>
        </div>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Dismiss shortcut helper"
          className="size-7 shrink-0 text-muted hover:text-foreground"
          onPress={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className={`mt-3 text-xs leading-relaxed text-foreground ${cardClass("sm", "inset")}`}>
        {isIOS ? (
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-foreground">
              {detectedBrowser === "chrome"
                ? "Add shortcut in Chrome for iOS:"
                : "Add shortcut in Safari or Chrome for iOS:"}
            </p>
            <ol className="flex flex-col gap-2 pl-4">
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap the <span className="font-semibold text-foreground">Share</span> button (
                <Share className="inline size-3.5 align-text-bottom text-accent" />) in the address
                bar or menu.
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Scroll down and tap{" "}
                <span className="font-semibold text-foreground">
                  &quot;Add to Home Screen&quot;
                </span>
                .
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap <span className="font-semibold text-foreground">Add</span> in the top-right
                corner.
              </li>
            </ol>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-foreground">Add shortcut in Chrome for Android:</p>
            <ol className="flex flex-col gap-2 pl-4">
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap the <span className="font-semibold text-foreground">menu</span> (
                <MoreVertical className="inline size-3.5 align-text-bottom text-accent" />) in the
                top-right corner of Chrome.
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap{" "}
                <span className="font-semibold text-foreground">
                  &quot;Install and create shortcut&quot;
                </span>{" "}
                (or{" "}
                <span className="font-semibold text-foreground">
                  &quot;Add to Home screen&quot;
                </span>
                ).
              </li>
              <li className="list-decimal marker:font-semibold marker:text-accent">
                Tap <span className="font-semibold text-foreground">Install</span> or{" "}
                <span className="font-semibold text-foreground">Add</span> to place it on your home
                screen.
              </li>
            </ol>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {installPrompt && !isIOS ? (
          <>
            <Button size="sm" variant="ghost" onPress={onDismiss}>
              Dismiss
            </Button>
            <Button size="sm" variant="primary" onPress={onNativeInstall}>
              <Download className="size-4" />
              Install and create shortcut
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onPress={onDismiss}>
            Got it
          </Button>
        )}
      </div>
    </aside>
  );
}
