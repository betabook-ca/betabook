"use client";

import { Button, Tooltip } from "@heroui/react";
import { clsx } from "clsx";
import { Menu } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { AppMenuLinks, type MenuAccount } from "@/components/app-menu-links";
import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientSession } from "@/hooks/use-client-session";

export function AppSidebar({ children }: { children: ReactNode }) {
  const session = useClientSession();
  const requestCount = useFriendRequestCount();
  return (
    <SidebarLayout
      account={session && { ...session.user, isAdmin: session.user.role === "admin" }}
      requestCount={requestCount}
    >
      {children}
    </SidebarLayout>
  );
}

/** Hover/focus previews overlay the page; pinning reserves space for the sidebar. */
export function SidebarLayout({
  account,
  requestCount = 0,
  children,
}: {
  account: MenuAccount | null | undefined;
  requestCount?: number;
  children: ReactNode;
}) {
  const [pinned, setPinned] = useState(false);
  const [preview, setPreview] = useState(false);
  const expanded = pinned || preview;
  const navId = useId();
  const toggleLabel = pinned
    ? "Collapse sidebar"
    : preview
      ? "Keep sidebar expanded"
      : "Expand sidebar";

  return (
    <div className={clsx("flex min-w-0 flex-1 flex-col", pinned ? "md:pl-56" : "md:pl-16")}>
      {/* Hover and bubbled focus reveal navigation; the aside itself is not a control. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <aside
        aria-label="Sidebar"
        className={clsx(
          "fixed inset-y-0 left-0 z-40 hidden flex-col bg-background motion-safe:transition-[width] motion-safe:duration-150 md:flex",
          expanded ? "w-56" : "w-16",
          preview && !pinned && "shadow-lg",
        )}
        onMouseEnter={() => setPreview(true)}
        onMouseLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) setPreview(false);
        }}
        onFocus={() => setPreview(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPreview(false);
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-separator"
        />
        <div className="flex h-14 shrink-0 items-center px-3">
          <Tooltip.Root delay={400}>
            <Button
              isIconOnly
              variant="ghost"
              className="size-10"
              aria-label={toggleLabel}
              aria-expanded={expanded}
              aria-controls={navId}
              onPress={() => {
                setPinned(!pinned);
                setPreview(false);
              }}
            >
              <Menu aria-hidden className="size-5" />
            </Button>
            <Tooltip.Content placement="right">{toggleLabel}</Tooltip.Content>
          </Tooltip.Root>
        </div>
        <nav
          id={navId}
          aria-label="Desktop"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3"
        >
          {account === undefined ? (
            <div role="status" aria-label="Loading navigation" className="flex flex-col gap-1">
              {["logbook", "progress", "community", "add"].map((key) => (
                <Skeleton key={key} rounded="rounded-lg" className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <AppMenuLinks
              account={account}
              requestCount={requestCount}
              collapsed={!expanded}
              surface="sidebar"
            />
          )}
        </nav>
      </aside>
      {children}
    </div>
  );
}
