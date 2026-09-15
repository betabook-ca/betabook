"use client";

import { buttonVariants } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useState } from "react";

import { DemoClimberSearch } from "@/components/product-tours/climber-search-preview";
import {
  DemoAccount,
  DemoAnalytics,
  DemoJournal,
  DemoProjects,
  DemoSends,
} from "@/components/product-tours/profile-tour-previews";
import { DemoFeed, DemoFriends } from "@/components/product-tours/social-tour-previews";
import type { ProductTourPageProps } from "@/components/product-tours/types";
import { cardClass } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import { WorkspaceSection } from "@/components/workspace-shell";

const WORKSPACE_SECTIONS = new Set(["Journal", "Sends", "Projects", "Analytics"]);
/** A visual reference to the app header's entry point, without a demo action. */
function DemoLog() {
  return (
    <span
      data-tour-target="journal-log"
      className={`${buttonVariants({ size: "sm" })} w-fit cursor-default gap-2`}
    >
      <CirclePlus aria-hidden className="size-4" />
      Log
    </span>
  );
}

export function JournalTourPage({ section, mode, href, steps }: ProductTourPageProps) {
  const isJournal = section === "Journal";
  const inLogbook = isJournal || section === "Sends";
  const areaSections = inLogbook ? ["Journal", "Sends"] : ["Projects", "Analytics"];
  const [friendRequest, setFriendRequest] = useState<"pending" | "accepted" | null>("pending");
  if (section === "Search") return <DemoClimberSearch feedHref={href("feed")} />;
  if (section === "Friends")
    return <DemoFriends incoming={friendRequest} onIncomingChange={setFriendRequest} />;
  if (section === "Feed") return <DemoFeed />;
  if (!WORKSPACE_SECTIONS.has(section))
    return (
      <section
        aria-label="Alex's Account settings"
        className={`${cardClass("md")} flex max-w-xl flex-col gap-4`}
      >
        <SectionHeading>Privacy</SectionHeading>
        <DemoAccount />
      </section>
    );
  return (
    <div className="flex flex-col gap-4">
      {mode === "full" && (
        <div className="flex h-14 items-center justify-end">
          <DemoLog />
        </div>
      )}
      <WorkspaceSection
        title={inLogbook ? "Logbook" : "Progress"}
        tabs={steps
          .filter(
            (step, index) =>
              areaSections.includes(step.section) &&
              steps.findIndex((entry) => entry.section === step.section) === index,
          )
          .sort((a, b) => areaSections.indexOf(a.section) - areaSections.indexOf(b.section))
          .map((step) => ({
            label: step.section === "Projects" ? "Open Projects" : step.section,
            href: href(step.id),
            current: section === step.section,
          }))}
      >
        <section aria-label={`Alex's ${section}`} className="flex min-w-0 flex-col gap-3">
          <SectionHeading className="sr-only">{section}</SectionHeading>
          {isJournal ? (
            <DemoJournal />
          ) : section === "Sends" ? (
            <DemoSends />
          ) : section === "Projects" ? (
            <DemoProjects />
          ) : (
            <div className="max-w-4xl">
              <DemoAnalytics />
            </div>
          )}
        </section>
      </WorkspaceSection>
    </div>
  );
}
