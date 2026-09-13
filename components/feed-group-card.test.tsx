import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import type { FeedDay } from "@/db/queries/feed";
import { buildFeedCards } from "@/lib/feed-groups";

import { FeedGroupCard } from "./feed-group-card";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const activity: FeedDay["activities"][number] = {
  id: 1,
  kind: "session",
  climbId: 12,
  climbName: "Quiet Arete",
  climbType: "boulder",
  climbGrade: 5,
  reportedGrade: 7,
  gradeFeel: "high",
  areaId: 3,
  areaName: "Pine Canyon",
  ascentStyle: null,
  body: "Alex's sequence",
  companions: [{ id: "sam", name: "Sam", isSelf: false }],
};
const day: FeedDay = {
  userId: "alex",
  name: "Alex",
  image: null,
  date: "2026-09-02",
  journalVisible: true,
  sends: 0,
  repeats: 0,
  sessions: 1,
  training: 0,
  activities: [activity],
};
function sharedClimbGroup(
  samGrade: Pick<FeedDay["activities"][number], "reportedGrade" | "gradeFeel">,
) {
  const [card] = buildFeedCards(
    [
      day,
      {
        ...day,
        userId: "sam",
        name: "Sam",
        journalVisible: false,
        sends: 1,
        sessions: 0,
        activities: [
          {
            ...activity,
            ...samGrade,
            id: 2,
            kind: "send",
            ascentStyle: "flash",
            body: null,
            companions: [],
          },
        ],
      },
    ],
    "all",
  );
  if (card.kind !== "group") throw Error("Expected explicitly connected group");
  return card;
}
it("shows the climb once and preserves both authors' statuses, notes, and authorized day destinations", () => {
  const html = renderToStaticMarkup(
    <FeedGroupCard group={sharedClimbGroup({ reportedGrade: 3, gradeFeel: "low" })} />,
  );
  expect(html.match(/href="\/climbs\/12\/quiet-arete"/g)).toHaveLength(1);
  expect(html).toContain('href="/users/alex"');
  expect(html).toContain('href="/users/sam"');
  expect(html).toContain('href="/users/alex/journal?date=2026-09-02"');
  expect(html).toContain('href="/users/sam/sends?date=2026-09-02"');
  expect(html).not.toContain("/users/sam/journal");
  expect(html).toContain("Alex&#x27;s sequence");
  expect(html).toContain("Session");
  expect(html).not.toContain(">Sent<");
  expect(html).toContain("Flash");
  expect(html).not.toContain("V4");
  expect(html).toContain("V6");
  expect(html).toContain("V2");
  expect(html).toContain("Felt hard for the grade");
  expect(html).toContain("Felt soft for the grade");
});
it("stands in the posted grade only for the climber who reported none", () => {
  const html = renderToStaticMarkup(
    <FeedGroupCard group={sharedClimbGroup({ reportedGrade: null, gradeFeel: null })} />,
  );
  expect(html.match(/V4/g)).toHaveLength(1);
  expect(html).toContain("V6");
  expect(html.match(/Posted grade, none reported/g)).toHaveLength(1);
  expect(html).not.toContain("Felt soft for the grade");
});
