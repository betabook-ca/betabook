import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
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
  albumUrl: null,
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 14,
  sendCount: 9,
  dayCount: 7,
  hasNotes: 0,
  companions: [],
};
const DATES = "dateFrom=2026-03-10&dateTo=2026-03-20";

function header(
  trip: TripSummary,
  viewerId: string | null = "alex",
  rest: Partial<ComponentProps<typeof TripHeader>> = {},
) {
  return (
    <TripHeader trip={trip} userId="alex" viewerId={viewerId} today={TODAY} {...rest}>
      <p>The trip.</p>
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

it("offers the owner a way to share the trip, and nobody else", () => {
  const link = "https://betabook.ca/users/alex/trips/7?share=0123456789abcdef0123456789abcdef";
  const { rerender } = render(header(BISHOP, "alex", { shareUrl: link }));
  expect(screen.getByRole("button", { name: "Share" })).toBeVisible();

  // Private: the button stays, to say why there is no link.
  rerender(header(BISHOP, "alex", { shareUrl: null }));
  expect(screen.getByRole("button", { name: "Share" })).toBeVisible();

  for (const reader of ["sam", null]) {
    rerender(header(BISHOP, reader));
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  }
  // Nor over the trip's analytics, which pass no link.
  rerender(header(BISHOP, "alex", { back: "trip" }));
  expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
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

it("offers no views to choose between: the trip is one page", () => {
  render(header({ ...BISHOP, hasNotes: 1 }));

  expect(screen.queryByRole("navigation", { name: "Trip views" })).not.toBeInTheDocument();
  for (const pill of ["Journal", "Sends", "Trip notes"]) {
    expect(screen.queryByRole("link", { name: pill })).not.toBeInTheDocument();
  }
});

it("counts what the trip holds, each count opening the Logbook under the trip's dates", () => {
  render(header(BISHOP));

  expect(screen.getByText("7", { exact: false })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "14 entries" })).toHaveAttribute(
    "href",
    `/users/alex/journal?${DATES}`,
  );
  expect(screen.getByRole("link", { name: "9 sends" })).toHaveAttribute(
    "href",
    `/users/alex/sends?${DATES}`,
  );
  // The line holds counts alone, so it fits a phone without wrapping.
  expect(screen.queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
});

it("counts the sends alone for a reader the journal is not shared with", () => {
  render(header({ ...BISHOP, entryCount: null, dayCount: null }, "sam"));

  expect(screen.getByRole("link", { name: "9 sends" })).toBeVisible();
  expect(document.body).not.toHaveTextContent(/entr|days logged/);
});

it("links no count that is nought, and counts nothing for a trip still to come", () => {
  const { rerender } = render(header({ ...BISHOP, entryCount: 0, dayCount: 0, sendCount: 0 }));
  expect(document.body).toHaveTextContent("0 entries");
  expect(document.body).toHaveTextContent("0 sends");
  expect(screen.queryByRole("link", { name: /entries|sends|Analytics/ })).not.toBeInTheDocument();

  rerender(
    header({
      ...BISHOP,
      startDate: "2026-10-01",
      endDate: "2026-10-09",
      entryCount: 0,
      dayCount: 0,
      sendCount: 0,
    }),
  );
  expect(document.body).not.toHaveTextContent(/0 entries|0 sends|days logged/);
});

it("leads back to the trip from its analytics", () => {
  render(header(BISHOP, "alex", { back: "trip" }));

  expect(screen.getByRole("link", { name: "Back to trip" })).toHaveAttribute(
    "href",
    "/users/alex/trips/7",
  );
});

it("is the same header for the signed-out holder of the profile link, less what they cannot open", () => {
  const token = "0123456789abcdef0123456789abcdef";
  render(header({ ...BISHOP, entryCount: null, dayCount: null }, null, { share: token }));

  expect(screen.getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(screen.getByText("Buttermilks.")).toBeVisible();
  expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute(
    "href",
    `/users/alex/trips?share=${token}`,
  );
  // The Logbook is behind sign-in, so the count is stated and not linked.
  expect(document.body).toHaveTextContent("9 sends");
  expect(screen.queryByRole("link", { name: /sends|Analytics/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
