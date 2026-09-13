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
  render(<ProfileInvite name="Alex Rivera" image={null} since={2021} next={NEXT} />);

  const invitation = screen.getByRole("region", { name: "Invitation" });
  expect(
    within(invitation).getByRole("heading", {
      level: 1,
      name: "Alex Rivera invited you to Betabook",
    }),
  ).toBeVisible();
  expect(invitation).toHaveTextContent("Climbing since 2021.");
  const links = within(invitation).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Sign up", `/sign-up?next=${encodeURIComponent(NEXT)}`],
    ["Sign in", `/sign-in?next=${encodeURIComponent(NEXT)}`],
  ]);
});

it("shows an avatar only for an owner with a profile photo", () => {
  const photo = "https://lh3.googleusercontent.com/a/alex";
  const { container, rerender } = render(
    <ProfileInvite name="Alex Rivera" image={null} since={2021} next={NEXT} />,
  );
  expect(container.querySelector("[data-image-src]")).toBeNull();
  expect(screen.queryByText("AR")).not.toBeInTheDocument();

  rerender(<ProfileInvite name="Alex Rivera" image={photo} since={2021} next={NEXT} />);
  expect(container.querySelector("[data-image-src]")).toHaveAttribute("data-image-src", photo);
});
