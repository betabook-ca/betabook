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
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileSectionNav } from "@/components/profile-tabs";
import { cardClass } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import type { HardestSend } from "@/db/queries/climber-overview";
import { TOUR_DEMO_ANALYTICS, TOUR_DEMO_CLIMBER } from "@/lib/product-tour-demo";

const PROFILE_SECTIONS = ["Journal", "Sends", "Projects", "Analytics"];
const DEMO_HARDEST: HardestSend[] = [
  { type: "boulder", grade: TOUR_DEMO_ANALYTICS.hardest[0].label },
];

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
  const [friendRequest, setFriendRequest] = useState<"pending" | "accepted" | null>("pending");
  if (section === "Search") return <DemoClimberSearch feedHref={href("feed")} />;
  if (section === "Friends")
    return <DemoFriends incoming={friendRequest} onIncomingChange={setFriendRequest} />;
  if (section === "Feed") return <DemoFeed />;
  if (!PROFILE_SECTIONS.includes(section))
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
    <div className="flex flex-col gap-6">
      {mode === "full" && (
        <div className="flex justify-end border-b border-separator pb-3">
          <DemoLog />
        </div>
      )}
      <ProfileLayout
        heading={<ProfileHeading name={TOUR_DEMO_CLIMBER.name} hardest={DEMO_HARDEST} />}
        tabs={
          <ProfileSectionNav
            tabs={steps
              .filter(
                (step, index) =>
                  PROFILE_SECTIONS.includes(step.section) &&
                  steps.findIndex((entry) => entry.section === step.section) === index,
              )
              .sort(
                (a, b) => PROFILE_SECTIONS.indexOf(a.section) - PROFILE_SECTIONS.indexOf(b.section),
              )
              .map((step) => ({
                label: step.section,
                href: href(step.id),
                current: section === step.section,
              }))}
          />
        }
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
      </ProfileLayout>
    </div>
  );
}
