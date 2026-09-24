"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { FriendRequestBadge } from "@/components/friend-request-badge";
import { useFriendRequestCount } from "@/components/friend-requests-provider";
import { SectionNavigation } from "@/components/ui/section-navigation";
import { AREA_LABELS, workspaceTabs, type PrimaryArea } from "@/lib/app-navigation";

type SectionTab = { label: string; href: string; current: boolean; badge?: ReactNode };

export function WorkspaceShell({
  area,
  userId,
  children,
}: {
  area: Exclude<PrimaryArea, "account">;
  userId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const requestCount = useFriendRequestCount();
  const tabs = workspaceTabs(area, userId).map((tab) => ({
    ...tab,
    badge:
      area === "community" && tab.href === "/friends" && requestCount > 0 ? (
        <FriendRequestBadge count={requestCount} />
      ) : undefined,
    current:
      pathname === tab.href || tab.roots.includes(pathname) || pathname.startsWith(`${tab.href}/`),
  }));
  return (
    <WorkspaceSection title={AREA_LABELS[area]} tabs={tabs}>
      {children}
    </WorkspaceSection>
  );
}

/** Shared task-first frame, also used by tutorials with lesson-local links. */
export function WorkspaceSection({
  title,
  tabs,
  children,
}: {
  title: string;
  tabs: readonly SectionTab[];
  children: ReactNode;
}) {
  return (
    <section aria-label={`${title} workspace`} className="flex min-w-0 flex-col gap-4">
      <h1 className="sr-only">
        {tabs.find((tab) => tab.current)?.label ?? title} · {title}
      </h1>
      <SectionNavigation label={`${title} sections`} tabs={tabs} appearance="workspace" />
      {children}
    </section>
  );
}
