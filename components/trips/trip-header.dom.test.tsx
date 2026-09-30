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

it("shows the actions menu to the owner only", () => {
  const { rerender } = render(header(BISHOP));
  expect(screen.getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Actions for Bishop, March 2026" })).toBeVisible();

  rerender(header(BISHOP, "sam"));
  expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
});

it("shows the Share button to the owner only", () => {
  const link = "https://betabook.ca/users/alex/trips/7?share=0123456789abcdef0123456789abcdef";
  const { rerender } = render(header(BISHOP, "alex", { shareUrl: link }));
  expect(screen.getByRole("button", { name: "Share" })).toBeVisible();

  // With a private profile the button stays, and the dialog explains why there
  // is no link.
  rerender(header(BISHOP, "alex", { shareUrl: null }));
  expect(screen.getByRole("button", { name: "Share" })).toBeVisible();

  for (const reader of ["sam", null]) {
    rerender(header(BISHOP, reader));
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  }
  // Not shown on the analytics page, which passes no share URL.
  rerender(header(BISHOP, "alex", { back: "trip" }));
  expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
});

it("shows a chip for upcoming and in-progress trips", () => {
  const { rerender } = render(header(BISHOP));
  expect(screen.queryByText(/Upcoming|On now/)).not.toBeInTheDocument();

  rerender(header({ ...BISHOP, startDate: "2026-10-01", endDate: "2026-10-09" }));
  expect(screen.getByText("Upcoming")).toBeVisible();

  rerender(header({ ...BISHOP, startDate: "2026-09-01", endDate: "2026-09-30" }));
  expect(screen.getByText("On now")).toBeVisible();
});

it("labels the back link without the arrow", () => {
  render(header(BISHOP));
  expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute(
    "href",
    "/users/alex/trips",
  );
});

it("renders no tabs", () => {
  render(header({ ...BISHOP, hasNotes: 1 }));

  expect(screen.queryByRole("navigation", { name: "Trip views" })).not.toBeInTheDocument();
  for (const pill of ["Journal", "Sends", "Trip notes"]) {
    expect(screen.queryByRole("link", { name: pill })).not.toBeInTheDocument();
  }
});

it("links the counts to the Journal and Sends filtered to the trip's dates, then to analytics", () => {
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
  expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute(
    "href",
    "/users/alex/trips/7/analytics",
  );
  // Analytics is the last item on the counts line.
  expect(screen.getByText("days logged", { exact: false }).closest("p")).toHaveTextContent(
    /^7 days logged\s*·\s*14 entries\s*·\s*9 sends\s*·\s*Analytics$/,
  );
});

it("shows only the send count and analytics when the viewer can't read the journal", () => {
  render(header({ ...BISHOP, entryCount: null, dayCount: null }, "sam"));

  expect(screen.getByRole("link", { name: "9 sends" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Analytics" })).toBeVisible();
  expect(document.body).not.toHaveTextContent(/entr|days logged/);
});

it("does not link zero counts, and hides counts for an upcoming trip", () => {
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

it("links back to the trip from the analytics page, and not to analytics", () => {
  render(header(BISHOP, "alex", { back: "trip" }));

  expect(screen.getByRole("link", { name: "Back to trip" })).toHaveAttribute(
    "href",
    "/users/alex/trips/7",
  );
  expect(screen.getByRole("link", { name: "9 sends" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
});

it("renders the same header for a signed-out visitor, without controls or Logbook links", () => {
  const token = "0123456789abcdef0123456789abcdef";
  render(header({ ...BISHOP, entryCount: null, dayCount: null }, null, { share: token }));

  expect(screen.getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(screen.getByText("Buttermilks.")).toBeVisible();
  expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute(
    "href",
    `/users/alex/trips?share=${token}`,
  );
  // Signed-out visitors can't open the Logbook, so the count is plain text.
  expect(document.body).toHaveTextContent("9 sends");
  expect(screen.queryByRole("link", { name: /sends|Analytics/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
