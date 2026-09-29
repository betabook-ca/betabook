import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { TripSummary, UserSendRow } from "@/db/queries";

import { SharedTrip, SharedTrips } from "./shared-trips";

vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image-src={src} />,
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const OWNER = { id: "owner-1", name: "Alex Rivera", image: null, token: TOKEN };
const BISHOP: TripSummary = {
  id: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks and the Happies.",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: null,
  sendCount: 3,
  dayCount: null,
  hasNotes: 0,
  companions: [],
};

function send(id: number, climbName: string): UserSendRow {
  return {
    id,
    climbId: id,
    climbName,
    climbType: "boulder",
    climbGrade: 5,
    areaId: 1,
    areaName: "Test Boulders",
    ascentStyle: "flash",
    dateSent: "2026-03-12",
    rating: 4,
    suggestedGrade: null,
    gradeFeel: "solid",
    comment: null,
  };
}

const signUp = (path: string) => `/sign-up?next=${encodeURIComponent(path)}`;

it("lists the trips, each opened by the link that opened the list", () => {
  render(<SharedTrips owner={OWNER} trips={[BISHOP]} today="2026-09-10" />);

  const trips = screen.getByRole("region", { name: "Trips" });
  expect(within(trips).getByRole("link", { name: "Bishop, March 2026" })).toHaveAttribute(
    "href",
    `/users/owner-1/trips/7?share=${TOKEN}`,
  );
  expect(within(trips).getByRole("link", { name: /Alex Rivera/ })).toHaveAttribute(
    "href",
    `/users/owner-1?share=${TOKEN}`,
  );
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
    "href",
    signUp(`/users/owner-1/trips?share=${TOKEN}`),
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows a trip as what it was and the sends inside it", () => {
  const path = `/users/owner-1/trips/7?share=${TOKEN}`;
  render(
    <SharedTrip
      owner={OWNER}
      trip={BISHOP}
      sends={[send(1, "Moon Slab"), send(2, "Warm-up Arete"), send(3, "Evilution")]}
      areaBreadcrumbs={{}}
      path={path}
    />,
  );

  const trip = screen.getByRole("region", { name: "Trip" });
  expect(within(trip).getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(trip).toHaveTextContent("Buttermilks and the Happies.");
  expect(trip).toHaveTextContent("3 sends");
  expect(trip).not.toHaveTextContent(/entr|days logged|With /);
  expect(within(trip).getByRole("link", { name: /All trips/ })).toHaveAttribute(
    "href",
    `/users/owner-1/trips?share=${TOKEN}`,
  );

  const sends = screen.getByRole("region", { name: "Sends" });
  expect(within(sends).getByRole("link", { name: "Moon Slab" })).toBeVisible();
  expect(sends).not.toHaveTextContent("most recent of");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", signUp(path));
  expect(screen.queryByRole("navigation", { name: "Trip views" })).not.toBeInTheDocument();
});

it("says so when a long trip has more sends than the page shows", () => {
  render(
    <SharedTrip
      owner={OWNER}
      trip={{ ...BISHOP, sendCount: 120 }}
      sends={[send(1, "Moon Slab")]}
      areaBreadcrumbs={{}}
      path="/users/owner-1/trips/7"
    />,
  );

  expect(screen.getByText("Showing the 1 most recent of 120 sends.")).toBeVisible();
});

it("says a trip with nothing sent has nothing sent", () => {
  render(
    <SharedTrip
      owner={OWNER}
      trip={{ ...BISHOP, sendCount: 0 }}
      sends={[]}
      areaBreadcrumbs={{}}
      path="/users/owner-1/trips/7"
    />,
  );

  expect(screen.getByText("Alex Rivera didn't log a send on this trip.")).toBeVisible();
});
