import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ProfileInvite } from "./profile-invite";

const NEXT = "/users/owner-1?share=0123456789abcdef0123456789abcdef";

it("says what signing up adds and returns both paths to the page the link opened", () => {
  render(<ProfileInvite name="Alex Rivera" next={NEXT} />);

  expect(
    screen.getByText(
      "Sign up to send Alex Rivera a friend request, see more of their climbing, and log your own sends and sessions.",
    ),
  ).toBeVisible();
  const links = screen.getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Sign up", `/sign-up?next=${encodeURIComponent(NEXT)}`],
    ["Sign in", `/sign-in?next=${encodeURIComponent(NEXT)}`],
  ]);
});

it("leaves the climber's name and photo to the profile's own heading", () => {
  render(<ProfileInvite name="Alex Rivera" next={NEXT} />);

  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(screen.queryByText("AR")).not.toBeInTheDocument();
});
