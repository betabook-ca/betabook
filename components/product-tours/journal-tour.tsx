"use client";

import { buttonVariants } from "@heroui/react";
import { CirclePlus, Users } from "lucide-react";
import { useState } from "react";

import { PROFILE_LAYOUT_CLASS } from "@/app/users/[id]/profile-layout";
import { FriendRequestBadge } from "@/components/friend-request-badge";
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
import { ProfileSectionNav } from "@/components/profile-tabs";
import { cardClass } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import type { ClimberOverview } from "@/db/queries/climber-overview";
import {
  TOUR_DEMO_ANALYTICS,
  TOUR_DEMO_CLIMBER,
  TOUR_DEMO_ENTRIES,
  TOUR_DEMO_SENDS,
} from "@/lib/product-tour-demo";

const PROFILE_SECTIONS = ["Journal", "Sends", "Projects", "Analytics"];
const SESSION_DATES = TOUR_DEMO_ENTRIES.filter((entry) => entry.kind === "session")
  .map((entry) => entry.date)
  .toSorted();
const LAST_OUT = SESSION_DATES.at(-1) ?? SESSION_DATES[0];

const DEMO_OVERVIEW: ClimberOverview = {
  sendCount: TOUR_DEMO_SENDS.length,
  areaCount: 1,
  hardest: [
    {
      type: "boulder",
      grade: TOUR_DEMO_ANALYTICS.hardest[0].label,
      sendCount: TOUR_DEMO_SENDS.length,
    },
  ],
  firstYear: Number(SESSION_DATES[0].slice(0, 4)),
  daysOut: TOUR_DEMO_ANALYTICS.daysOut,
  lastOut: LAST_OUT,
  daysThisMonth: new Set(SESSION_DATES.filter((date) => date.startsWith(LAST_OUT.slice(0, 7))))
    .size,
  month: LAST_OUT.slice(0, 7),
};

/** A visual reference to the app's entry point, without a demo action. */
function DemoLog() {
  return (
    <span
      data-tour-target="journal-log"
      className={`${buttonVariants()} w-fit cursor-default gap-2`}
    >
      <CirclePlus aria-hidden className="size-5" />
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
    <div className={PROFILE_LAYOUT_CLASS}>
      <aside aria-label="Climber summary" className="xl:row-span-2">
        <ProfileHeading
          name={TOUR_DEMO_CLIMBER.name}
          overview={DEMO_OVERVIEW}
          actions={
            <>
              {mode === "full" && <DemoLog />}
              <span className={`${buttonVariants({ variant: "outline" })} cursor-default gap-2`}>
                <Users aria-hidden className="size-4" />
                Friends
                <FriendRequestBadge count={friendRequest === "pending" ? 1 : 0} />
              </span>
            </>
          }
        />
      </aside>
      <ProfileSectionNav
        tabs={steps
          .filter(
            (step, index) =>
              PROFILE_SECTIONS.includes(step.section) &&
              steps.findIndex((entry) => entry.section === step.section) === index,
          )
          .sort((a, b) => PROFILE_SECTIONS.indexOf(a.section) - PROFILE_SECTIONS.indexOf(b.section))
          .map((step) => ({
            label: step.section,
            href: href(step.id),
            current: section === step.section,
          }))}
      />
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
    </div>
  );
}
