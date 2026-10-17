"use client";

import { usePathname } from "next/navigation";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { withProfileShare } from "@/lib/profile-share";

type ProfileTabsProps = {
  userId: string;
  showJournal: boolean;
  /** Whether the viewer can open the owner's trips. */
  showTrips: boolean;
  /** Share token for a signed-out visitor. Limits the tabs to the ones the link
   * can open and adds the token to each href. */
  share?: string;
  /** Share token a signed-in visitor arrived with, added to each href without
   * changing which tabs show, so trips opened through the link stay reachable. */
  carryShare?: string;
};

type ProfileTab = {
  path: string;
  label: string;
  /** Other paths that count as this tab's page. */
  roots?: string[];
  /** True if the tab also covers paths nested under its href, like trip pages. */
  nested?: boolean;
};

/** Sections of a climber profile. Owner workspaces use their own scoped navigation. */
export function ProfileTabs({
  userId,
  showJournal,
  showTrips,
  share,
  carryShare,
}: ProfileTabsProps) {
  const pathname = usePathname();
  const token = share ?? carryShare;
  const base = `/users/${userId}`;

  const trips: ProfileTab[] = showTrips
    ? [{ path: `${base}/trips`, label: "Trips", nested: true }]
    : [];
  const tabs: ProfileTab[] = share
    ? [{ path: base, label: "Sends" }, ...trips]
    : [
        ...(showJournal ? [{ path: `${base}/journal`, label: "Journal", roots: [base] }] : []),
        { path: `${base}/sends`, label: "Sends", roots: showJournal ? [] : [base] },
        ...trips,
        { path: `${base}/analytics`, label: "Analytics" },
      ];

  return (
    <SectionNavigation
      label="Profile sections"
      tabs={tabs.map(({ path, label, roots = [], nested = false }) => ({
        href: token ? withProfileShare(path, token) : path,
        label,
        current:
          pathname === path ||
          roots.includes(pathname) ||
          (nested && pathname.startsWith(`${path}/`)),
      }))}
    />
  );
}
