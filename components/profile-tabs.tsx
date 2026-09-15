"use client";

import { usePathname } from "next/navigation";

import { SectionNavigation } from "@/components/ui/section-navigation";

type ProfileTabsProps = {
  userId: string;
  showJournal: boolean;
};

/** Sections of a climber profile. Owner workspaces use their own scoped navigation. */
export function ProfileTabs({ userId, showJournal }: ProfileTabsProps) {
  const pathname = usePathname();
  const base = `/users/${userId}`;

  const tabs: { href: string; label: string; roots: string[] }[] = [
    ...(showJournal ? [{ href: `${base}/journal`, label: "Journal", roots: [base] }] : []),
    { href: `${base}/sends`, label: "Sends", roots: showJournal ? [] : [base] },
    { href: `${base}/analytics`, label: "Analytics", roots: [] },
  ];

  return (
    <SectionNavigation
      label="Profile sections"
      tabs={tabs.map((tab) => ({
        ...tab,
        current: pathname === tab.href || tab.roots.includes(pathname),
      }))}
    />
  );
}
