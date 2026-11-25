"use client";

import { Button } from "@heroui/react";
import { Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { PAGE_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { useYearReviewStatus } from "@/hooks/use-year-review-status";
import { yearReviewPath } from "@/lib/year-review-share";

const DISMISS_PREFIX = "betabook:year-review-dismissed";

function dismissKey(userId: string, year: number) {
  return `${DISMISS_PREFIX}:${userId}:${year}`;
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    localStorage.setItem(key, "true");
  } catch {
    /* Dismissal lasts for this page only. */
  }
}

/** Paths the banner never shows on: the recap itself, someone else's recap
 * link, tutorials and the auth pages. */
function excluded(pathname: string, userId: string): boolean {
  return (
    pathname.startsWith(`/users/${userId}/year`) ||
    pathname.startsWith("/year/") ||
    pathname.startsWith("/tutorial") ||
    ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/accept-terms"].includes(
      pathname,
    )
  );
}

/**
 * App-wide invitation to the climber's recap, Dec 1 – Jan 14. Renders
 * nothing until the session and the recap's status are known, so it never
 * shifts the page for anyone it doesn't apply to. Dismissal is per device
 * and year; opening the recap dismisses it too.
 */
export function YearReviewBanner({ alwaysOpen }: { alwaysOpen: boolean }) {
  const status = useYearReviewStatus(alwaysOpen);
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const key = status ? dismissKey(status.userId, status.year) : null;
  const onRecap = status ? pathname.startsWith(`/users/${status.userId}/year`) : false;

  useEffect(() => {
    if (key && onRecap) writeDismissed(key);
  }, [key, onRecap]);

  if (!status || !key || !status.active) return null;
  if (excluded(pathname, status.userId) || dismissed === key || readDismissed(key)) return null;

  return (
    <div className="px-4 pb-2">
      <aside
        aria-label={`Your ${status.year} year in review`}
        className={`mx-auto flex w-full ${PAGE_MAX_WIDTH_CLASS} items-center gap-3 rounded-panel bg-accent px-4 py-3 text-accent-foreground`}
      >
        <Sparkles aria-hidden="true" className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 text-sm font-medium">
          Your {status.year} in climbing is ready.
        </p>
        <AppLink
          href={yearReviewPath(status.userId, status.year)}
          className="shrink-0 rounded-full bg-accent-foreground px-3 py-1.5 text-sm font-semibold text-accent"
          onNavigate={() => writeDismissed(key)}
        >
          See your year
        </AppLink>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Dismiss"
          className="shrink-0 text-accent-foreground"
          onPress={() => {
            writeDismissed(key);
            setDismissed(key);
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </aside>
    </div>
  );
}
