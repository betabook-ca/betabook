"use client";

import { usePathname } from "next/navigation";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { withProfileShare } from "@/lib/profile-share";

type ProfileTabsProps = {
  userId: string;
  showJournal: boolean;
  /** Share token for a signed-out visitor. Limits the tabs to the ones the link
   * can open and adds the token to each href. */
  share?: string;
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
export function ProfileTabs({ userId, showJournal, share }: ProfileTabsProps) {
  const pathname = usePathname();
  const base = `/users/${userId}`;

  const tabs: ProfileTab[] = share
    ? [
        { path: base, label: "Sends" },
        { path: `${base}/trips`, label: "Trips", nested: true },
      ]
    : [
        ...(showJournal ? [{ path: `${base}/journal`, label: "Journal", roots: [base] }] : []),
        { path: `${base}/sends`, label: "Sends", roots: showJournal ? [] : [base] },
        { path: `${base}/trips`, label: "Trips", nested: true },
        { path: `${base}/analytics`, label: "Analytics" },
      ];

  return (
    <SectionNavigation
      label="Profile sections"
      tabs={tabs.map(({ path, label, roots = [], nested = false }) => ({
        href: share ? withProfileShare(path, share) : path,
        label,
        current:
          pathname === path ||
          roots.includes(pathname) ||
          (nested && pathname.startsWith(`${path}/`)),
      }))}
    />
  );
}
