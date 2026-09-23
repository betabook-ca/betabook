"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const DELAY_MS = 400;

/** Debounce href changes relative to the canonical URL represented by currentHref.
 * urlChangedExternally distinguishes incoming navigation from this hook's own
 * replaces, so callers can reseed state without discarding in-progress typing. */
export function useDebouncedReplace(
  href: string,
  currentHref: string,
): { isPending: boolean; urlChangedExternally: boolean } {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Track every outstanding navigation so a slow earlier response is not
  // misclassified as external. State keeps render-time consumption deterministic.
  const [navigatedHrefs, setNavigatedHrefs] = useState<string[]>([]);
  const [prevCurrentHref, setPrevCurrentHref] = useState(currentHref);
  const currentHrefChanged = currentHref !== prevCurrentHref;
  const navigatedIndex = currentHrefChanged ? navigatedHrefs.indexOf(currentHref) : -1;
  if (currentHrefChanged) {
    setPrevCurrentHref(currentHref);
    // Consume the match and older navigations; an external URL invalidates the queue.
    setNavigatedHrefs(navigatedIndex === -1 ? [] : navigatedHrefs.slice(navigatedIndex + 1));
  }
  const urlChangedExternally = currentHrefChanged && navigatedIndex === -1;

  useEffect(() => {
    if (href === currentHref) return;
    const timeout = setTimeout(() => {
      setNavigatedHrefs((pending) => [...pending, href]);
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    }, DELAY_MS);
    return () => clearTimeout(timeout);
  }, [href, currentHref, router, startTransition]);

  return { isPending, urlChangedExternally };
}
