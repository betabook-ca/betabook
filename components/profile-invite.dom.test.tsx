import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ProfileInvite } from "./profile-invite";

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

it("names the inviter and returns both authentication paths to the share link", () => {
  render(<ProfileInvite name="Alex Rivera" image={null} next={NEXT} />);

  const invitation = screen.getByRole("region", { name: "Invitation" });
  expect(
    within(invitation).getByRole("heading", {
      level: 1,
      name: "Alex Rivera invited you to Betabook",
    }),
  ).toBeVisible();
  const links = within(invitation).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Sign up", `/sign-up?next=${encodeURIComponent(NEXT)}`],
    ["Sign in", `/sign-in?next=${encodeURIComponent(NEXT)}`],
  ]);
});

it("shows the owner's photo, and their initials when they have none", () => {
  const photo = "https://lh3.googleusercontent.com/a/alex";
  const { container, rerender } = render(
    <ProfileInvite name="Alex Rivera" image={null} next={NEXT} />,
  );
  // An inviter with no photo keeps the avatar slot rather than collapsing the
  // card into a bare heading.
  expect(container.querySelector("[data-image-src]")).toBeNull();
  expect(screen.getByText("AR")).toBeVisible();

  rerender(<ProfileInvite name="Alex Rivera" image={photo} next={NEXT} />);
  expect(container.querySelector("[data-image-src]")).toHaveAttribute("data-image-src", photo);
  expect(screen.queryByText("AR")).not.toBeInTheDocument();
});
