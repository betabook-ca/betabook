import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { TripSummary, UserSendRow } from "@/db/queries";
import { SITE_NAME } from "@/lib/site";

import { SharedTrip } from "./shared-trips";

vi.mock("@/actions", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>(), refresh: vi.fn<() => void>() }),
  usePathname: () => "/users/owner-1/trips/7",
}));
vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image-src={src} />,
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const OWNER = { id: "owner-1", name: "Alex Rivera", image: null, token: TOKEN };
const BISHOP: TripSummary = {
  id: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks and the Happies.",
  albumUrl: null,
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
const TODAY = "2026-09-10";
const PATH = `/users/owner-1/trips/7?share=${TOKEN}`;

function trip(props: Partial<Parameters<typeof SharedTrip>[0]> = {}) {
  return (
    <SharedTrip
      owner={OWNER}
      trip={BISHOP}
      sends={[send(1, "Moon Slab"), send(2, "Warm-up Arete"), send(3, "Evilution")]}
      areaBreadcrumbs={{}}
      path={PATH}
      today={TODAY}
      {...props}
    />
  );
}

it("shows a trip under the header a member sees, with the sends inside it", () => {
  render(trip());

  expect(screen.getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(screen.getByText("Mar 10, 2026 – Mar 20, 2026")).toBeVisible();
  expect(screen.getByText("Buttermilks and the Happies.")).toBeVisible();
  expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute(
    "href",
    `/users/owner-1/trips?share=${TOKEN}`,
  );

  expect(screen.getByRole("heading", { name: "Sends" })).toHaveClass("sr-only");
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  // A row links its climb first, then where it is.
  expect(rows.map((row) => within(row).getAllByRole("link")[0].textContent)).toEqual([
    "Moon Slab",
    "Warm-up Arete",
    "Evilution",
  ]);
  expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
});

it("offers nothing a signed-out reader cannot open", () => {
  render(trip());

  // One view, so no pills to choose between; no menu, no tags, no journal.
  expect(screen.queryByRole("navigation", { name: "Trip views" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/entr|days logged|With /);
  // The invitation is the frame's; the trip closes with the one prompt.
  expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: `Climb with Alex Rivera on ${SITE_NAME}` }),
  ).toHaveAttribute("href", signUp(PATH));
});

it("puts the trip's photos under its header, above the sends inside it", () => {
  render(trip({ photos: <section aria-label="Photos">The album</section> }));

  const photos = screen.getByRole("region", { name: "Photos" });
  const name = screen.getByRole("heading", { name: "Bishop, March 2026" });
  const sends = screen.getByRole("list");
  expect(name.compareDocumentPosition(photos)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(photos.compareDocumentPosition(sends)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it("says so when a long trip has more sends than the page shows", () => {
  render(trip({ trip: { ...BISHOP, sendCount: 120 }, sends: [send(1, "Moon Slab")] }));

  expect(screen.getByText("Showing the 1 most recent of 120 sends.")).toBeVisible();
  expect(screen.getByRole("link", { name: "See all 120 sends" })).toHaveAttribute(
    "href",
    signUp(PATH),
  );
});

it("marks a trip that has not started, as its card does", () => {
  render(
    trip({
      trip: { ...BISHOP, startDate: "2026-10-01", endDate: "2026-10-09", sendCount: 0 },
      sends: [],
    }),
  );

  expect(screen.getByText("Upcoming")).toBeVisible();
});

it("says a trip with nothing sent has nothing sent, in the shared profile's words", () => {
  render(trip({ trip: { ...BISHOP, sendCount: 0 }, sends: [] }));

  expect(screen.getByText("Alex Rivera hasn't logged a send on this trip yet.")).toBeVisible();
});
