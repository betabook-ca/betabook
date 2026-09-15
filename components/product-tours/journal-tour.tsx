"use client";

import { buttonVariants } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useState } from "react";

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
import { TourNavigationFrame } from "@/components/product-tours/tour-navigation-frame";
import type { ProductTourPageProps } from "@/components/product-tours/types";
import { SectionHeading } from "@/components/ui/typography";
import { WorkspaceSection } from "@/components/workspace-shell";
import type { PrimaryArea } from "@/lib/app-navigation";

/** A visual reference to the app header's entry point, without a demo action. */
function DemoLog() {
  return (
    <span
      data-tour-target="journal-log"
      className={`${buttonVariants()} h-11 w-fit cursor-default gap-2 px-3 @lg/navigation:h-10 @lg/navigation:px-4`}
    >
      <CirclePlus aria-hidden className="size-5" />
      Log
    </span>
  );
}

export function JournalTourPage({ section, mode, href, steps }: ProductTourPageProps) {
  const isJournal = section === "Journal";
  const inLogbook = isJournal || section === "Sends";
  const areaSections = inLogbook ? ["Journal", "Sends"] : ["Open Projects", "Analytics"];
  const [friendRequest, setFriendRequest] = useState<"pending" | "accepted" | null>("pending");
  const current: PrimaryArea | undefined = inLogbook
    ? "logbook"
    : section === "Open Projects" || section === "Analytics"
      ? "progress"
      : section === "Friends" || section === "Feed"
        ? "community"
        : section === "Search"
          ? undefined
          : "account";
  function content() {
    if (section === "Search") return <DemoClimberSearch feedHref={href("feed")} />;
    if (section === "Friends" || section === "Feed")
      return (
        <WorkspaceSection
          title="Community"
          tabs={[
            { label: "Feed", href: href("feed"), current: section === "Feed" },
            {
              label: "Friends",
              href: href("friend-requests"),
              current: section === "Friends",
              badge: <FriendRequestBadge count={friendRequest === "pending" ? 1 : 0} />,
            },
          ]}
        >
          {section === "Friends" ? (
            <DemoFriends incoming={friendRequest} onIncomingChange={setFriendRequest} />
          ) : (
            <DemoFeed />
          )}
        </WorkspaceSection>
      );
    if (current === "account")
      return (
        <>
          <h1 className="sr-only">Account settings</h1>
          <DemoAccount />
        </>
      );
    return (
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
            label: step.section,
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
          ) : section === "Open Projects" ? (
            <DemoProjects />
          ) : (
            <div className="max-w-4xl">
              <DemoAnalytics />
            </div>
          )}
        </section>
      </WorkspaceSection>
    );
  }
  return (
    <TourNavigationFrame
      current={current}
      href={href}
      requestCount={friendRequest === "pending" ? 1 : 0}
      logAction={mode === "full" ? <DemoLog /> : undefined}
    >
      {content()}
    </TourNavigationFrame>
  );
}
