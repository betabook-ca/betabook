import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import type { SharedProject as SharedProjectData, SharedProjectSession } from "@/db/queries";
import { formatDate } from "@/lib/format-date";

import { SharedProject } from "./shared-project";

const PROJECT: SharedProjectData = {
  ownerId: "usr_alex",
  ownerName: "Alex Rivera",
  ownerImage: null,
  climbId: 101,
  climbName: "Moon Slab",
  climbType: "boulder",
  climbGrade: 8,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Cedar Block",
  pinnedAt: "2026-03-02",
  sessionCount: 2,
  firstSession: "2026-03-02",
  lastSession: "2026-09-01",
  sentOn: null,
  ascentStyle: null,
  rating: null,
  suggestedGrade: null,
  gradeFeel: null,
  sendComment: null,
  sent: false,
};

const SENT: SharedProjectData = {
  ...PROJECT,
  sent: true,
  sentOn: "2026-09-14",
  ascentStyle: "flash",
  rating: 4,
  suggestedGrade: 9,
  gradeFeel: "high",
  sendComment: "Felt a grade harder than the book says.",
};

const SESSIONS: SharedProjectSession[] = [
  { id: 4021, entryDate: "2026-09-01", body: "Held the crux once.", tags: ["beta"] },
  { id: 3884, entryDate: "2026-08-24", body: null, tags: [] },
];

/** Signed in, so the sign-up prompt stays out of the markup these assert on. */
const render = (project: SharedProjectData) =>
  renderToStaticMarkup(
    <SharedProject project={project} sessions={SESSIONS} signedIn path="/projects/abc" />,
  );

it("links the climber's profile, which a link can only reach while it is public", () => {
  expect(render(PROJECT)).toContain('href="/users/usr_alex"');
});

it("links the climb, which the catalog makes public to everyone", () => {
  // The owner's own card links it, and this page claims to show what they see.
  expect(render(PROJECT)).toContain('href="/climbs/101/moon-slab"');
});

it("dates a send to the day, not the month it landed in", () => {
  // A share overrides the month-only date the anonymous climb-page list uses.
  expect(render(SENT)).toContain(formatDate("2026-09-14"));
});

it("prints the send's own opinion of the climb beside it", () => {
  const html = render(SENT);

  expect(html).toContain("Flash");
  expect(html).toContain("Felt a grade harder than the book says.");
});

it("says the send comment once when the timeline already carries it", () => {
  // A dated send mirrors its comment into the ascent entry, so both the card
  // and the timeline hold the same text. The owner's own board never prints
  // it twice, and neither should this.
  const mirrored: SharedProjectSession[] = [
    { id: 4100, entryDate: "2026-09-14", body: SENT.sendComment, tags: [] },
    ...SESSIONS,
  ];
  const html = renderToStaticMarkup(
    <SharedProject project={SENT} sessions={mirrored} signedIn path="/projects/abc" />,
  );

  const comment = SENT.sendComment!;
  expect(html.split(comment).length - 1).toBe(1);
});

it("still says it when no entry carries it, as an undated send has none", () => {
  const html = renderToStaticMarkup(
    <SharedProject
      project={{ ...SENT, sentOn: null }}
      sessions={SESSIONS}
      signedIn
      path="/projects/abc"
    />,
  );

  expect(html).toContain("Felt a grade harder than the book says.");
});

it("prints no send line while a project is still open", () => {
  const html = render(PROJECT);

  expect(html).not.toContain("Flash");
  expect(html).not.toContain("Sent");
});
