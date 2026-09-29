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

it("renders the trip header and the trip's sends", () => {
  render(trip());

  expect(screen.getByRole("heading", { name: "Bishop, March 2026" })).toBeVisible();
  expect(screen.getByText("Mar 10, 2026 – Mar 20, 2026")).toBeVisible();
  expect(screen.getByText("Buttermilks and the Happies.")).toBeVisible();
  expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute(
    "href",
    `/users/owner-1/trips?share=${TOKEN}`,
  );

  // The heading is visible, as on the signed-in trip page.
  expect(screen.getByRole("heading", { name: "Sends" })).not.toHaveClass("sr-only");
  expect(document.body).toHaveTextContent("3 sends");
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  // The first link in a row is the climb.
  expect(rows.map((row) => within(row).getAllByRole("link")[0].textContent)).toEqual([
    "Moon Slab",
    "Warm-up Arete",
    "Evilution",
  ]);
  expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
});

it("renders no controls or Logbook links for signed-out visitors", () => {
  render(trip());

  // No menu, tags or journal counts, and no links into the Logbook.
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /sends$|Analytics/ })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/entr|days logged|With /);
  // The sign-up invite is in the profile header. The trip page ends with one
  // prompt.
  expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: `Climb with Alex Rivera on ${SITE_NAME}` }),
  ).toHaveAttribute("href", signUp(PATH));
});

it("renders photos between the header and the sends", () => {
  render(trip({ photos: <section aria-label="Photos">The album</section> }));

  const photos = screen.getByRole("region", { name: "Photos" });
  const name = screen.getByRole("heading", { name: "Bishop, March 2026" });
  const sends = screen.getByRole("list");
  expect(name.compareDocumentPosition(photos)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(photos.compareDocumentPosition(sends)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it("renders notes between the photos and the sends", () => {
  render(
    trip({
      photos: <section aria-label="Photos">The album</section>,
      notes: <section aria-label="Trip notes">Camped at the Pit.</section>,
    }),
  );

  const photos = screen.getByRole("region", { name: "Photos" });
  const notes = screen.getByRole("region", { name: "Trip notes" });
  const sends = screen.getByRole("list");
  expect(photos.compareDocumentPosition(notes)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(notes.compareDocumentPosition(sends)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it("says when only some of the trip's sends are shown", () => {
  render(trip({ trip: { ...BISHOP, sendCount: 120 }, sends: [send(1, "Moon Slab")] }));

  expect(screen.getByText("Showing the 1 most recent of 120 sends.")).toBeVisible();
  expect(screen.getByRole("link", { name: "See all 120 sends" })).toHaveAttribute(
    "href",
    signUp(PATH),
  );
});

it("shows the Upcoming chip for a trip that hasn't started", () => {
  render(
    trip({
      trip: { ...BISHOP, startDate: "2026-10-01", endDate: "2026-10-09", sendCount: 0 },
      sends: [],
    }),
  );

  expect(screen.getByText("Upcoming")).toBeVisible();
});

it("shows an empty message for a trip with no sends", () => {
  render(trip({ trip: { ...BISHOP, sendCount: 0 }, sends: [] }));

  expect(screen.getByText("Alex Rivera hasn't logged a send on this trip yet.")).toBeVisible();
});
