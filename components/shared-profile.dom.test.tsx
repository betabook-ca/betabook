import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { UserSendRow } from "@/db/queries";

import { SharedProfile } from "./shared-profile";

vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image-src={src} />,
}));

const NEXT = "/users/owner-1?share=0123456789abcdef0123456789abcdef";
const OWNER = { name: "Alex Rivera" };

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
    videoUrl: null,
  };
}

const SIGN_UP = `/sign-up?next=${encodeURIComponent(NEXT)}`;

it("lists the latest sends and links the rest to sign-up", () => {
  render(
    <SharedProfile
      owner={OWNER}
      sendCount={12}
      sends={[send(1, "Granite Staircase", "Shared with everyone"), send(2, "Sidepull Sonata")]}
      areaBreadcrumbs={{}}
      next={NEXT}
    />,
  );

  // The Sends tab already labels the section, so the heading is visually
  // hidden.
  expect(screen.getByRole("heading", { name: "Sends" })).toHaveClass("sr-only");
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByRole("link", { name: "Granite Staircase" })).toBeVisible();
  expect(within(rows[0]).getByText("Shared with everyone")).toBeVisible();
  expect(within(rows[1]).getByRole("link", { name: "Sidepull Sonata" })).toBeVisible();

  const prompt = screen.getByRole("region", { name: "See all 12 sends" });
  expect(within(prompt).getByRole("link", { name: "See all 12 sends" })).toHaveAttribute(
    "href",
    SIGN_UP,
  );
});

it("does not render the invite, trips or stats itself", () => {
  render(
    <SharedProfile
      owner={OWNER}
      sendCount={12}
      sends={[send(1, "Granite Staircase")]}
      areaBreadcrumbs={{}}
      next={NEXT}
    />,
  );

  expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Trips" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Peak grade|Most logged/i)).not.toBeInTheDocument();
});

it("shows a sign-up prompt when the owner has no sends", () => {
  render(<SharedProfile owner={OWNER} sendCount={0} sends={[]} areaBreadcrumbs={{}} next={NEXT} />);

  expect(screen.getByText("Alex Rivera hasn't logged a send yet.")).toBeVisible();
  const prompt = screen.getByRole("region", { name: "Climb with Alex Rivera on Betabook" });
  expect(
    within(prompt).getByRole("link", { name: "Climb with Alex Rivera on Betabook" }),
  ).toHaveAttribute("href", SIGN_UP);
});
