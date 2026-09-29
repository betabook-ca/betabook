import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { TripSummary, UserSendRow, UserStatsSummary } from "@/db/queries";

import { SharedProfile } from "./shared-profile";

vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image-src={src} />,
}));

const NEXT = "/users/owner-1?share=0123456789abcdef0123456789abcdef";
const OWNER = { name: "Alex Rivera", image: null };
const SUMMARY: UserStatsSummary = {
  sendCount: 12,
  areaCount: 4,
  peakGrade: "V6",
  mostLoggedDiscipline: { type: "boulder", count: 9 },
  latestSendDate: "2026-09-01",
};

function send(id: number, climbName: string, comment: string | null = null): UserSendRow {
  return {
    id,
    climbId: id,
    climbName,
    climbType: "boulder",
    climbGrade: 5,
    areaId: 1,
    areaName: "Test Boulders",
    ascentStyle: "flash",
    dateSent: "2026-09-01",
    rating: 4,
    suggestedGrade: null,
    gradeFeel: "solid",
    comment,
  };
}

const SIGN_UP = `/sign-up?next=${encodeURIComponent(NEXT)}`;

it("previews recent sends under one invitation and links the rest to sign-up", () => {
  render(
    <SharedProfile
      owner={OWNER}
      summary={SUMMARY}
      sends={[send(1, "Granite Staircase", "Shared with everyone"), send(2, "Sidepull Sonata")]}
      areaBreadcrumbs={{}}
      next={NEXT}
    />,
  );

  const recent = screen.getByRole("region", { name: "Recent sends" });
  expect(within(recent).getByRole("link", { name: "Granite Staircase" })).toBeVisible();
  expect(within(recent).getByRole("link", { name: "Sidepull Sonata" })).toBeVisible();
  expect(within(recent).getByText("Shared with everyone")).toBeVisible();

  const invitation = screen.getByRole("region", { name: "Invitation" });
  expect(screen.getAllByRole("link", { name: "Sign up" })).toEqual([
    within(invitation).getByRole("link", { name: "Sign up" }),
  ]);
  expect(screen.getAllByRole("link", { name: "Sign in" })).toEqual([
    within(invitation).getByRole("link", { name: "Sign in" }),
  ]);

  const prompt = screen.getByRole("region", { name: "See all 12 sends" });
  const heading = within(prompt).getByRole("heading", { name: "See all 12 sends" });
  expect(within(heading).getByRole("link", { name: "See all 12 sends" })).toHaveAttribute(
    "href",
    SIGN_UP,
  );
});

it("invites a visitor to climb with an owner who hasn't logged a send", () => {
  render(
    <SharedProfile
      owner={OWNER}
      summary={{
        sendCount: 0,
        areaCount: 0,
        peakGrade: null,
        mostLoggedDiscipline: null,
        latestSendDate: null,
      }}
      sends={[]}
      areaBreadcrumbs={{}}
      next={NEXT}
    />,
  );

  expect(screen.getByText("Alex Rivera hasn't logged a send yet.")).toBeVisible();
  const prompt = screen.getByRole("region", { name: "Climb with Alex Rivera on Betabook" });
  expect(
    within(prompt).getByRole("link", { name: "Climb with Alex Rivera on Betabook" }),
  ).toHaveAttribute("href", SIGN_UP);
  expect(screen.getAllByRole("link", { name: "Sign up" })).toHaveLength(1);
});

const TOKEN = "0123456789abcdef0123456789abcdef";
const BISHOP: TripSummary = {
  id: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks and the Happies.",
  albumUrl: null,
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: null,
  sendCount: 9,
  dayCount: null,
  hasNotes: 0,
  companions: [],
};

function withTrips(latest: TripSummary[], total: number) {
  return (
    <SharedProfile
      owner={OWNER}
      summary={SUMMARY}
      sends={[send(1, "Granite Staircase")]}
      areaBreadcrumbs={{}}
      trips={{ userId: "owner-1", token: TOKEN, latest, total, today: "2026-09-10" }}
      next={NEXT}
    />
  );
}

it("lists the latest trips and opens each, and the rest, by the same link", () => {
  render(withTrips([BISHOP], 4));

  const trips = screen.getByRole("region", { name: "Trips" });
  expect(within(trips).getByRole("link", { name: "Bishop, March 2026" })).toHaveAttribute(
    "href",
    `/users/owner-1/trips/7?share=${TOKEN}`,
  );
  expect(trips).toHaveTextContent("9 sends");
  expect(trips).not.toHaveTextContent(/entr|days logged/);
  expect(within(trips).getByRole("link", { name: "All 4 trips" })).toHaveAttribute(
    "href",
    `/users/owner-1/trips?share=${TOKEN}`,
  );
});

it("keeps the prompt about sends beside the sends, ahead of the trips", () => {
  render(withTrips([BISHOP], 1));

  const order = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
  const prompt = order.findIndex((label) => /^See all|^Climb with/.test(label ?? ""));
  expect(prompt).toBe(order.indexOf("Recent sends") + 1);
  expect(prompt).toBeLessThan(order.indexOf("Trips"));
});

it("points at no longer list when every trip is shown, and draws nothing for none", () => {
  const { rerender } = render(withTrips([BISHOP], 1));
  expect(screen.queryByRole("link", { name: /^All / })).not.toBeInTheDocument();

  rerender(withTrips([], 0));
  expect(screen.queryByRole("region", { name: "Trips" })).not.toBeInTheDocument();
});
