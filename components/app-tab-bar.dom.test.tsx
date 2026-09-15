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
  useFriendRequestCount: () => 1,
}));

beforeEach(() => {
  state.pathname = "/feed";
  state.session = { user: { id: "owner", name: "Alex Morgan", image: null } };
});

const tabBar = () => screen.queryByRole("navigation", { name: "Primary" });

it("shows a signed-in climber the tab bar with their request count", () => {
  render(<AppTabBar />);

  expect(tabBar()).toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.queryByRole("link", { name: /^(You|Account settings)$/ })).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Community, 1 pending friend request" }),
  ).toBeInTheDocument();
});

it("has no tab bar when signed out", () => {
  state.session = null;
  const { container } = render(<AppTabBar />);

  expect(container).toBeEmptyDOMElement();
});

it("removes the tab bar and its spacer during tutorials and restores them afterward", () => {
  state.pathname = "/tutorial/journal/journal";
  const { container, rerender } = render(<AppTabBar />);

  expect(container).toBeEmptyDOMElement();
  state.pathname = "/feed";
  rerender(<AppTabBar />);
  expect(tabBar()).toBeInTheDocument();
});

it("steps aside while typing and returns for other controls", async () => {
  const user = userEvent.setup();
  const { container } = render(<AppTabBar />);
  render(
    <>
      <input aria-label="Display name" />
      <input type="checkbox" aria-label="Private profile" />
    </>,
  );

  await user.click(screen.getByRole("textbox", { name: "Display name" }));
  expect(container).toBeEmptyDOMElement();

  await user.click(screen.getByRole("checkbox", { name: "Private profile" }));
  expect(tabBar()).toBeInTheDocument();
});
