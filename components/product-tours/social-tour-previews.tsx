"use client";

import { useState } from "react";

import { FeedTimeline } from "@/components/feed-timeline";
import { FriendRequestBadge } from "@/components/friend-request-badge";
import { FriendshipActionButton } from "@/components/friendship-action-button";
import { choicePillClass } from "@/components/ui/choice-pill";
import { SectionNavigation } from "@/components/ui/section-navigation";
import { SectionHeading } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { FeedDay } from "@/db/queries/feed";
import { parseGrade } from "@/lib/grades";
import { TOUR_DEMO_FRIEND_DAY, TOUR_DEMO_PEOPLE } from "@/lib/product-tour-demo";

/** Sample interactions stay in this component; no friendship actions or profile links. */
export function DemoFriends({
  incoming,
  onIncomingChange,
}: {
  incoming: "pending" | "accepted" | null;
  onIncomingChange: (value: "pending" | "accepted" | null) => void;
}) {
  const [view, setView] = useState<"friends" | "requests">("requests");
  const showPerson = view === "requests" ? incoming === "pending" : incoming === "accepted";
  return (
    <div className="flex w-full flex-col gap-6">
      <section
        data-tour-target="friend-requests"
        aria-label="Friends"
        className="flex flex-col gap-3"
      >
        <SectionHeading>Friends</SectionHeading>
        <SectionNavigation
          label="Friend lists"
          appearance="pills"
          tabs={[
            {
              id: "friends",
              label: "Friends",
              current: view === "friends",
              onSelect: () => setView("friends"),
            },
            {
              id: "requests",
              label: "Requests",
              current: view === "requests",
              onSelect: () => setView("requests"),
              badge: <FriendRequestBadge count={incoming === "pending" ? 1 : 0} />,
            },
          ]}
        />
        {showPerson ? (
          <article className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <UserAvatar name={TOUR_DEMO_PEOPLE.requester} size="sm" />
              <div>
                <h3 className="font-semibold">{TOUR_DEMO_PEOPLE.requester}</h3>
                {incoming === "pending" && (
                  <p role="status" className="text-sm text-muted">
                    Wants to be friends
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {incoming === "pending" ? (
                <>
                  <FriendshipActionButton
                    action="accept"
                    name={TOUR_DEMO_PEOPLE.requester}
                    onPress={(complete) => {
                      onIncomingChange("accepted");
                      complete();
                    }}
                  />
                  <FriendshipActionButton
                    action="decline"
                    name={TOUR_DEMO_PEOPLE.requester}
                    onPress={(complete) => {
                      onIncomingChange(null);
                      complete();
                    }}
                  />
                </>
              ) : (
                <FriendshipActionButton
                  action="remove"
                  name={TOUR_DEMO_PEOPLE.requester}
                  onPress={(complete) => {
                    onIncomingChange(null);
                    complete();
                  }}
                />
              )}
            </div>
          </article>
        ) : (
          <p role="status" className="text-sm text-muted">
            {view === "requests" ? "No pending friend requests." : "No friends yet."}
          </p>
        )}
      </section>
    </div>
  );
}

export function DemoFeed() {
  const [view, setView] = useState<"All" | "Sends">("All");
  const day = TOUR_DEMO_FRIEND_DAY;
  const entries = day.entries.filter((entry) => view === "All" || entry.kind === "send");
  const sample: FeedDay = {
    userId: "tour-friend",
    name: day.name,
    image: null,
    date: day.date,
    journalVisible: true,
    sends: entries.filter((entry) => entry.kind === "send").length,
    sessions: entries.filter((entry) => entry.kind === "session").length,
    training: entries.filter((entry) => entry.kind === "training").length,
    repeats: 0,
    activities: entries.map((entry, index) => ({
      id: -(index + 1),
      kind: entry.kind,
      ascentStyle: entry.ascentStyle,
      climbId: entry.climb?.id ?? null,
      climbName: entry.climb?.name ?? null,
      climbType: entry.climb ? "boulder" : null,
      climbGrade: entry.climb ? parseGrade("boulder", entry.climb.grade) : null,
      reportedGrade: null,
      gradeFeel: null,
      areaId: null,
      areaName: null,
      body: entry.note,
    })),
  };
  return (
    <section aria-label="Friends' activity" className="flex w-full flex-col gap-3">
      <SectionHeading>Feed</SectionHeading>
      <div data-tour-target="friend-feed" className="flex flex-col gap-3">
        <div role="group" aria-label="Feed activity" className="flex gap-2">
          {(["All", "Sends"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              className={choicePillClass(view === option, "bg-foreground text-background")}
              onClick={() => setView(option)}
            >
              {option === "All" ? "All activity" : option}
            </button>
          ))}
        </div>
        <FeedTimeline days={[sample]} view={view === "All" ? "all" : "sends"} links={false} />
      </div>
    </section>
  );
}
