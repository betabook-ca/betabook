import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { UserSendRow, UserStatsSummary } from "@/db/queries";

import { SharedProfile } from "./shared-profile";

vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{props.children}</a>,
}));
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

it("previews stats and recent sends, then asks the visitor to sign up for the rest", () => {
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
  expect(screen.getByText("V6")).toBeVisible();

  const prompt = screen.getByRole("region", { name: "Sign up to see more" });
  expect(within(prompt).getByRole("heading", { name: "See all 12 sends" })).toBeVisible();
  for (const region of [screen.getByRole("region", { name: "Invitation" }), prompt]) {
    expect(within(region).getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      `/sign-up?next=${encodeURIComponent(NEXT)}`,
    );
  }
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
  const prompt = screen.getByRole("region", { name: "Sign up to see more" });
  expect(within(prompt).getByRole("heading", { name: "Climb with Alex Rivera" })).toBeVisible();
});
