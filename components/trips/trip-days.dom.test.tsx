import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { JournalEntry, UserSendRow } from "@/db/queries";
import { groupTripDays } from "@/lib/trip-days";

import { TripDays } from "./trip-days";

vi.mock("@/actions", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>(), refresh: vi.fn<() => void>() }),
  usePathname: () => "/users/owner-1/trips/7",
}));

const SEND: UserSendRow = {
  id: 1,
  climbId: 101,
  climbName: "Moon Slab",
  climbType: "boulder",
  climbGrade: 5,
  areaId: 1,
  areaName: "Test Boulders",
  ascentStyle: "redpoint",
  dateSent: "2026-03-12",
  rating: 4,
  suggestedGrade: null,
  gradeFeel: "solid",
  comment: null,
  videos: null,
};

function entry(id: number, props: Partial<JournalEntry> & { entryDate: string }): JournalEntry {
  return {
    id,
    climbId: 202,
    kind: "session",
    sent: false,
    body: null,
    tags: [],
    climbName: "Warm-up Arete",
    climbType: "boulder",
    climbGrade: 2,
    climbBrokenOn: null,
    areaId: 1,
    areaName: "Test Boulders",
    isAscent: false,
    isSendComment: false,
    ...props,
  };
}

function renderDays(entries: JournalEntry[]) {
  render(
    <TripDays
      days={groupTripDays({ startDate: "2026-03-10", sends: [SEND], entries }).days}
      areaBreadcrumbs={{}}
      userId="owner-1"
      isOwner={false}
      emptyMessage="Nothing logged on this trip yet."
    />,
  );
}

it("puts each day's sends and entries under a heading for that day", () => {
  renderDays([
    entry(10, { entryDate: "2026-03-10", body: "Feet kept cutting." }),
    entry(11, { entryDate: "2026-03-12", climbId: 101, climbName: "Moon Slab", isAscent: true }),
    entry(12, { entryDate: "2026-03-12", body: "Second lap." }),
  ]);

  expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
    "Day 1 · Tue, Mar 10",
    "Day 3 · Thu, Mar 12",
  ]);
  expect(
    within(screen.getByRole("region", { name: "Day 1 · Tue, Mar 10" })).getByText(
      "Feet kept cutting.",
    ),
  ).toBeVisible();

  // The send replaces its ascent entry, so Moon Slab appears once, before the
  // entry logged after it.
  const day3 = screen.getByRole("region", { name: "Day 3 · Thu, Mar 12" });
  const rows = within(day3).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByRole("link", { name: "Moon Slab" })).toBeVisible();
  expect(within(rows[1]).getByText("Second lap.")).toBeVisible();
});

it("shows the empty message when nothing is logged", () => {
  render(
    <TripDays
      days={[]}
      areaBreadcrumbs={{}}
      userId="owner-1"
      isOwner={false}
      emptyMessage="Nothing logged on this trip yet."
    />,
  );
  expect(screen.getByText("Nothing logged on this trip yet.")).toBeVisible();
  expect(screen.queryByRole("heading")).toBeNull();
});
