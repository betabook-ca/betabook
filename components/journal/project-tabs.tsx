"use client";

import { SectionNavigation } from "@/components/ui/section-navigation";

/** Open and Sent are two views of one list — the climbs you pinned, split by
 * whether you've sent them — so they sit under a single Projects workspace
 * tab rather than competing with it for room in the primary row. */
export function ProjectTabs({ view, userId }: { view: "open" | "sent"; userId: string }) {
  return (
    <SectionNavigation
      appearance="pills"
      label="Project lists"
      tabs={[
        { href: `/users/${userId}/projects`, label: "Open", current: view === "open" },
        { href: `/users/${userId}/projects/sent`, label: "Sent", current: view === "sent" },
      ]}
    />
  );
}
