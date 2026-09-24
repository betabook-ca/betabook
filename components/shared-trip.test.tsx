import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import type { SharedTrip as SharedTripData, SharedTripEntry, SharedTripSend } from "@/db/queries";
import { formatDate } from "@/lib/format-date";

import { SharedTrip } from "./shared-trip";

const TRIP: SharedTripData = {
  ownerId: "usr_alex",
  ownerName: "Alex Rivera",
  ownerImage: null,
  tripId: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks.",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  // Matches the lists rendered below, so the truncation notice stays silent
  // unless a test deliberately makes the counts exceed them.
  entryCount: 1,
  sendCount: 1,
  dayCount: 1,
};

const SEND: SharedTripSend = {
  climbId: 101,
  climbName: "Moon Slab",
  climbType: "boulder",
  climbGrade: 8, // V7
  areaId: 3,
  areaName: "Cedar Block",
  dateSent: "2026-03-18",
  ascentStyle: "redpoint",
  rating: 4,
  suggestedGrade: null,
  gradeFeel: null,
  comment: null,
};

const ENTRY: SharedTripEntry = {
  id: 1,
  kind: "session",
  entryDate: "2026-03-18",
  body: "Held the crux.",
  tags: ["beta"],
  sent: true,
  climbId: 101,
  climbName: "Moon Slab",
  climbType: "boulder",
  climbGrade: 8,
  areaId: 3,
  areaName: "Cedar Block",
};

function render(over: Partial<Parameters<typeof SharedTrip>[0]> = {}) {
  return renderToStaticMarkup(
    <SharedTrip
      trip={TRIP}
      entries={[ENTRY]}
      sends={[SEND]}
      signedIn={false}
      path="/trips/4f9c2a7e1b8d6035c9e4a1f7b2d80e36"
      {...over}
    />,
  );
}

it("leads with the climb's posted grade when the climber suggested none", () => {
  // Suggesting a grade is optional and abstaining is the default, so this is
  // the ordinary send. Leading with the suggestion would print the app's
  // absent-value dash in place of a grade the catalog knows.
  const html = render();
  expect(html).toContain("V7");
  expect(html).not.toContain("—");
});

it("shows the suggestion alongside the posted grade when they differ", () => {
  const html = render({ sends: [{ ...SEND, suggestedGrade: 9, gradeFeel: "high" }] });
  expect(html).toContain("V7");
  expect(html).toContain("V8");
});

it("publishes the send whole: exact date, rating and the climber's comment", () => {
  const html = render({ sends: [{ ...SEND, comment: "Felt soft for the grade." }] });
  expect(html).toContain(formatDate("2026-03-18"));
  expect(html).toContain("Felt soft for the grade.");
  expect(html).toContain("Redpoint");
});

it("links each climb to the catalog and the climber to their profile", () => {
  const html = render();
  expect(html).toContain('href="/climbs/101');
  expect(html).toContain('href="/users/usr_alex"');
});

it("offers the sign-up prompt only to a reader who has no account", () => {
  expect(render()).toContain("Sign up");
  expect(render({ signedIn: true })).not.toContain("Sign up");
});

it("says so when the bounded list did not reach the end", () => {
  // The counts come from unbounded COUNT(*); the lists are capped. A whole
  // season is a valid trip, so the two can legitimately disagree.
  const html = render({ trip: { ...TRIP, entryCount: 412, sendCount: 260 } });
  expect(html).toContain("Showing the 1 most recent of 412 entries.");
  expect(html).toContain("Showing the 1 most recent of 260 sends.");
});

it("stays quiet when the list is complete", () => {
  const html = render();
  expect(html).not.toContain("most recent of");
});
