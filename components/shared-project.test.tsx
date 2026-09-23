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

it("dates a send to the day, not the month it landed in", () => {
  // The page used to publish a month, to stop a reader picking the owner's
  // row out of the climb page's anonymous send list. A share overrides that.
  expect(render(SENT)).toContain(formatDate("2026-09-14"));
});

it("prints the send's own opinion of the climb beside it", () => {
  const html = render(SENT);

  expect(html).toContain("Flash");
  expect(html).toContain("Felt a grade harder than the book says.");
});

it("prints no send line while a project is still open", () => {
  const html = render(PROJECT);

  expect(html).not.toContain("Flash");
  expect(html).not.toContain("Sent");
});
