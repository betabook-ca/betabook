import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { TripSummary } from "@/db/queries";

import { TripHeader } from "./trip-header";

vi.mock("@/actions", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>(), refresh: vi.fn<() => void>() }),
  usePathname: () => "/users/alex/trips/7",
}));

const TODAY = "2026-09-10";
const BISHOP: TripSummary = {
  id: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks.",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 14,
  sendCount: 9,
  dayCount: 7,
  hasNotes: 0,
  companions: [],
};

function header(trip: TripSummary, viewerId = "alex") {
  return (
    <TripHeader
      trip={trip}
      userId="alex"
      viewerId={viewerId}
      today={TODAY}
      current="journal"
      journalVisible
    >
      <p>The view.</p>
    </TripHeader>
  );
}

it("gives the owner the trip's actions beside its name, and a visitor none", () => {
  const { rerender } = render(header(BISHOP));
  expect(screen.getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Actions for Bishop, March 2026" })).toBeVisible();

  rerender(header(BISHOP, "sam"));
  expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
});

it("marks a trip that is upcoming or on now, as its card does", () => {
  const { rerender } = render(header(BISHOP));
  expect(screen.queryByText(/Upcoming|On now/)).not.toBeInTheDocument();

  rerender(header({ ...BISHOP, startDate: "2026-10-01", endDate: "2026-10-09" }));
  expect(screen.getByText("Upcoming")).toBeVisible();

  rerender(header({ ...BISHOP, startDate: "2026-09-01", endDate: "2026-09-30" }));
  expect(screen.getByText("On now")).toBeVisible();
});

it("names the way back without reading out an arrow", () => {
  render(header(BISHOP));
  expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute(
    "href",
    "/users/alex/trips",
  );
});
