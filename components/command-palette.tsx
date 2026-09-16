"use client";

import { Kbd, useOverlayState } from "@heroui/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";

import { Brand } from "@/components/brand";
import { useSearchScope } from "@/components/search-scope";
import { AppLink } from "@/components/ui/app-link";
import { DeferredLoadError } from "@/components/ui/deferred-load-error";
import { useDeferredComponent } from "@/hooks/use-deferred-component";
import { isApplePlatform, useModifierLabels } from "@/hooks/use-platform";
import { authClient } from "@/lib/auth-client";
import { SEARCH_PATH } from "@/lib/search";

/** Module-level so its identity is stable across renders — the preload hook
 * keys its effect on the loader. */
const loadPaletteDialog = () =>
  import("@/components/search/app-quick-search").then((m) => m.AppQuickSearch);

const OpenSearchContext = createContext<(() => void) | null>(null);

/** Opens the site-wide search palette from anywhere under the provider, so
 * every search affordance on the page is a way into the same palette rather
 * than a second search of its own. Null outside the provider. */
function useOpenSearch(): (() => void) | null {
  return useContext(OpenSearchContext);
}

/** Site-wide search on ⌘K (Ctrl+K off macOS) — a navigator, so every row
 * goes somewhere and the last one always escapes to full search rather than
 * dead-ending on "no results".
 *
 * Owns the palette and binds the chord, and hands `open` down so the header
 * button, the home page's entry, and the shortcut are three doors into one
 * search rather than three searches. Wraps the app because those doors sit
 * in different parts of the tree.
 *
 * The current area is offered as an explicit narrowing action. Search starts
 * globally so opening it in a crag does not silently change its meaning.
 *
 * The palette itself is a deferred chunk (see use-deferred-component): this
 * provider wraps every route, and `Modal` would otherwise put react-aria's
 * overlay machinery in the bundle for pages that have no overlay at all. The
 * state and the chord stay here — both are cheap, and the chord has to be
 * bound before the chunk arrives so an early ⌘K isn't swallowed. */
export function SearchPaletteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const canSearchQuickly = !!session && !isPending;
  const state = useOverlayState();
  const scope = useSearchScope();
  const { Component: PaletteDialog, load, failed } = useDeferredComponent(loadPaletteDialog);

  const { open, setOpen, close } = state;
  // Pulls the chunk in on the way to opening, for the case where a very
  // early ⌘K beats the idle preload. Ordinarily this is already resolved and
  // the call is a no-op.
  const openPalette = useCallback(() => {
    if (!canSearchQuickly) {
      router.push(SEARCH_PATH);
      return;
    }
    load();
    open();
  }, [canSearchQuickly, router, load, open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Command on Apple, Control on Windows/Linux (which have no Command
      // key at all) — deliberately not "either modifier": Ctrl+K is
      // kill-line in a macOS text field, and claiming it there would break
      // editing in every form on the site.
      const chord = isApplePlatform()
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      if (!chord || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      openPalette();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPalette]);

  const onNavigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  return (
    <OpenSearchContext.Provider value={openPalette}>
      {children}
      {canSearchQuickly && state.isOpen && failed && (
        <DeferredLoadError feature="search" onRetry={load} onDismiss={close} />
      )}
      {canSearchQuickly && PaletteDialog && (
        <PaletteDialog
          isOpen={state.isOpen}
          onOpenChange={setOpen}
          scopeAreaId={scope?.areaId}
          scopeAreaName={scope?.areaName}
          onNavigate={onNavigate}
        />
      )}
    </OpenSearchContext.Provider>
  );
}

/** The header's way into the palette, and where the shortcut is advertised.
 * Purely an affordance — the chord itself is bound by the provider, so it
 * works on pages that never render this. */
export function SearchTrigger() {
  const openSearch = useOpenSearch();
  const { data: session, isPending } = authClient.useSession();
  return (
    <SearchTriggerControl
      onOpenSearch={session && !isPending ? (openSearch ?? undefined) : undefined}
    />
  );
}

export function SearchTriggerControl({
  onOpenSearch,
  responsiveTo = "viewport",
  showShortcut = true,
}: {
  onOpenSearch?: () => void;
  responsiveTo?: "viewport" | "container";
  showShortcut?: boolean;
}) {
  const keys = useModifierLabels();
  const contained = responsiveTo === "container";
  const className = `flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl bg-surface px-3 text-muted shadow-sm transition-colors hover:text-foreground focus-visible:status-focused ${contained ? "@lg/navigation:h-10 @lg/navigation:rounded-lg @lg/navigation:border @lg/navigation:border-border @lg/navigation:bg-transparent @lg/navigation:shadow-none" : "md:h-10 md:rounded-lg md:border md:border-border md:bg-transparent md:shadow-none"}`;
  const contents = (
    <>
      <Brand
        decorative
        compact
        className={`size-6 ${contained ? "@lg/navigation:hidden" : "md:hidden"}`}
      />
      <span className="truncate text-sm">Search</span>
      <Search
        aria-hidden
        className={`ms-auto size-5 shrink-0 ${contained ? "@lg/navigation:-order-1 @lg/navigation:ms-0" : "md:-order-1 md:ms-0"}`}
      />
      {showShortcut && onOpenSearch && keys && (
        <Kbd
          className={`ms-auto hidden ${contained ? "@lg/navigation:inline-flex" : "md:inline-flex"}`}
        >
          {keys.palette}
        </Kbd>
      )}
    </>
  );
  if (!onOpenSearch)
    return (
      <AppLink href={SEARCH_PATH} aria-label="Search" className={className}>
        {contents}
      </AppLink>
    );

  return (
    <button
      type="button"
      onClick={onOpenSearch}
      aria-label="Search"
      aria-keyshortcuts={showShortcut ? keys?.ariaPalette : undefined}
      className={className}
    >
      {contents}
    </button>
  );
}
