import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { JournalEntry, UserSendRow } from "@/db/queries";
import { groupTripDays } from "@/lib/trip-days";

import { TripDays } from "./trip-days";

vi.mock("@/actions", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>(), refresh: vi.fn<() => void>() }),
  usePathname: () => "/users/owner-1/trips/7",
  useSearchParams: () => new URLSearchParams(),
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
  // Each day says what it holds, so a glance at the header tells days apart.
  expect(within(day3).getByText("1 send · 1 session")).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Day 1 · Tue, Mar 10" })).getByText("1 session"),
  ).toBeVisible();
  const rows = within(day3).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByRole("link", { name: "Moon Slab" })).toBeVisible();
  expect(within(rows[1]).getByText("Second lap.")).toBeVisible();
});

it("lists the crags a day visited under its heading, once each, in the order logged", () => {
  render(
    <TripDays
      days={
        groupTripDays({
          startDate: "2026-03-10",
          sends: [SEND],
          entries: [
            entry(40, { entryDate: "2026-03-12", areaId: 2, areaName: "Dim Cave" }),
            entry(41, { entryDate: "2026-03-12" }),
            // A training entry has no crag.
            entry(42, {
              entryDate: "2026-03-12",
              kind: "training",
              climbId: null,
              climbName: null,
              climbType: null,
              climbGrade: null,
              areaId: null,
              areaName: null,
            }),
          ],
        }).days
      }
      areaBreadcrumbs={{ 1: [{ id: 9, name: "Test Crag" }] }}
      userId="owner-1"
      isOwner={false}
      emptyMessage="Nothing logged on this trip yet."
    />,
  );
  const day = screen.getByRole("region", { name: "Day 3 · Thu, Mar 12" });
  // Names only, joined by a middle dot: no ancestors, no repeats.
  expect(within(day).getByText("Dim Cave · Test Boulders")).toBeVisible();
  expect(within(day).queryByText(/Test Crag ·|Test Crag \//)).toBeNull();
});

it("counts each row in the day header the way its chip labels it", () => {
  render(
    <TripDays
      days={
        groupTripDays({
          startDate: "2026-03-10",
          sends: [],
          entries: [
            entry(30, { entryDate: "2026-03-11", sent: true }),
            entry(31, { entryDate: "2026-03-11", climbId: 303, sent: true, isAscent: true }),
            entry(32, { entryDate: "2026-03-11" }),
          ],
        }).days
      }
      areaBreadcrumbs={{}}
      userId="owner-1"
      isOwner={false}
      emptyMessage="Nothing logged on this trip yet."
    />,
  );
  // A repeat is a repeat, and an ascent shown as an entry is still a send.
  expect(screen.getByText("1 send · 1 repeat · 1 session")).toBeVisible();
  expect(screen.getByText("Repeat")).toBeVisible();
});

it("offers the order button only when there are two days to order", () => {
  const sameDay = groupTripDays({
    startDate: "2026-03-10",
    sends: [SEND],
    entries: [entry(12, { entryDate: "2026-03-12" })],
  }).days;
  const { rerender } = render(
    <TripDays
      heading="Days"
      days={sameDay}
      areaBreadcrumbs={{}}
      userId="owner-1"
      isOwner={false}
      emptyMessage="Nothing logged on this trip yet."
    />,
  );
  // Two things logged, but one day: nothing to reorder.
  expect(screen.getByRole("heading", { level: 2, name: "Days" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Sort/ })).toBeNull();

  const twoDays = groupTripDays({
    startDate: "2026-03-10",
    sends: [SEND],
    entries: [entry(10, { entryDate: "2026-03-10" })],
  }).days;
  rerender(
    <TripDays
      heading="Days"
      days={twoDays}
      areaBreadcrumbs={{}}
      userId="owner-1"
      isOwner={false}
      emptyMessage="Nothing logged on this trip yet."
    />,
  );
  expect(screen.getByRole("button", { name: "Sort ascending" })).toBeVisible();
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
