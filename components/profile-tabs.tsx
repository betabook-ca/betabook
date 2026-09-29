"use client";

import { usePathname } from "next/navigation";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { withProfileShare } from "@/lib/profile-share";

type ProfileTabsProps = {
  userId: string;
  showJournal: boolean;
  /** The climber's profile link, for its signed-out holder: the tabs are
   * what the link opens, and each carries it. */
  share?: string;
};

type ProfileTab = {
  path: string;
  label: string;
  /** Other paths that are this section's own page. */
  roots?: string[];
  /** A section whose pages nest under its path, as a trip's views do. */
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
