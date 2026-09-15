import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent, ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { HeaderNavigation } from "./app-menu";

const navigation = vi.hoisted(() => ({ pathname: "/users/owner" }));

beforeEach(() => {
  navigation.pathname = "/users/owner";
  // jsdom has no media queries; responsive drawer switching is covered in Playwright.
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }));
});

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "owner", name: "Alex Morgan", image: null, role: "user" } },
      isPending: false,
    }),
    signOut: () => {},
  },
}));
vi.mock("@/components/friend-requests-provider", () => ({
  useFriendRequestCount: () => 2,
}));

it("opens secondary tools without duplicating the visible mobile tabs or their badge", async () => {
  const user = userEvent.setup();
  render(<HeaderNavigation />);

  await user.click(screen.getByRole("button", { name: "Open menu" }));

  const menu = await screen.findByRole("dialog", { name: "Menu" });
  expect(
    within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Add climb or area", "Tutorials"]);
  expect(within(menu).queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  expect(within(menu).getByRole("link", { name: "Tutorials" })).toBeInTheDocument();
});

it("closes the menu when a destination is chosen", async () => {
  const user = userEvent.setup();
  render(<HeaderNavigation />);

  await user.click(screen.getByRole("button", { name: /^Open menu/ }));
  const menu = await screen.findByRole("dialog", { name: "Menu" });
  await user.click(within(menu).getByRole("link", { name: "Tutorials" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("keeps primary destinations available during tutorials where the tabs are hidden", async () => {
  navigation.pathname = "/tutorial/journal/journal";
  const user = userEvent.setup();
  render(<HeaderNavigation />);
  await user.click(screen.getByRole("button", { name: "Open menu" }));
  const menu = await screen.findByRole("dialog", { name: "Menu" });
  expect(within(menu).getByRole("link", { name: "Logbook" })).toHaveAttribute(
    "href",
    "/users/owner/journal",
  );
  expect(within(menu).getByRole("link", { name: "Progress" })).toHaveAttribute(
    "href",
    "/users/owner/goals",
  );
  expect(
    within(menu).getByRole("link", { name: "Community, 2 pending friend requests" }),
  ).toHaveAttribute("href", "/feed");
});
