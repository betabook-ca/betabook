import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { AppTabBar } from "./app-tab-bar";

type Session = { user: { id: string; name: string; image: null } } | null;
const state = vi.hoisted(() => ({ pathname: "/feed", session: null as Session }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: state.session, isPending: false }) },
}));
vi.mock("@/components/friend-requests-provider", () => ({
  useFriendRequests: () => ({ userId: "owner", count: 1, refresh: async () => {} }),
}));

beforeEach(() => {
  state.pathname = "/feed";
  state.session = { user: { id: "owner", name: "Alex Morgan", image: null } };
});

const tabBar = () => screen.queryByRole("navigation", { name: "Primary" });

it("shows a signed-in climber the tab bar with their request count", () => {
  render(<AppTabBar />);

  expect(tabBar()).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Friends, 1 pending friend request" }),
  ).toBeInTheDocument();
});

it("has no tab bar when signed out", () => {
  state.session = null;
  render(<AppTabBar />);

  expect(tabBar()).not.toBeInTheDocument();
});

it("stays out of a tutorial", () => {
  state.pathname = "/tutorial/journal/log";
  render(<AppTabBar />);

  expect(tabBar()).not.toBeInTheDocument();
});

it("steps aside while typing and returns for other controls", async () => {
  const user = userEvent.setup();
  render(
    <>
      <AppTabBar />
      <input aria-label="Display name" />
      <input type="checkbox" aria-label="Private profile" />
    </>,
  );

  await user.click(screen.getByRole("textbox", { name: "Display name" }));
  expect(tabBar()).not.toBeInTheDocument();

  await user.click(screen.getByRole("checkbox", { name: "Private profile" }));
  expect(tabBar()).toBeInTheDocument();
});
