"use client";

import { usePathname } from "next/navigation";

import { SectionNavigation } from "@/components/ui/section-navigation";

type ProfileTabsProps = {
  userId: string;
  showJournal: boolean;
};

type ProfileTab = {
  href: string;
  label: string;
  /** Other paths that are this section's own page. */
  roots?: string[];
  /** A section whose pages nest under its path, as a trip's views do. */
  nested?: boolean;
};

/** Sections of a climber profile. Owner workspaces use their own scoped navigation. */
export function ProfileTabs({ userId, showJournal }: ProfileTabsProps) {
  const pathname = usePathname();
  const base = `/users/${userId}`;

  const tabs: ProfileTab[] = [
    ...(showJournal ? [{ href: `${base}/journal`, label: "Journal", roots: [base] }] : []),
    { href: `${base}/sends`, label: "Sends", roots: showJournal ? [] : [base] },
    { href: `${base}/trips`, label: "Trips", nested: true },
    { href: `${base}/analytics`, label: "Analytics" },
  ];

  return (
    <SectionNavigation
      label="Profile sections"
      tabs={tabs.map(({ href, label, roots = [], nested = false }) => ({
        href,
        label,
        current:
          pathname === href ||
          roots.includes(pathname) ||
          (nested && pathname.startsWith(`${href}/`)),
      }))}
    />
  );
}
