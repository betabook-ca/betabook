import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent, ReactNode } from "react";
import { expect, it, vi } from "vitest";

import { AppMenuButton } from "./app-menu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/users/owner",
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
  useFriendRequests: () => ({ userId: "owner", count: 2, refresh: async () => {} }),
}));

it("names pending requests on the menu button and opens the menu", async () => {
  const user = userEvent.setup();
  render(<AppMenuButton />);

  await user.click(screen.getByRole("button", { name: "Open menu, 2 pending friend requests" }));
  const menu = await screen.findByRole("dialog", { name: "Menu" });

  expect(within(menu).getByRole("link", { name: /Alex Morgan/ })).toHaveAttribute(
    "href",
    "/users/owner",
  );
  expect(
    within(menu).getByRole("link", { name: "Friends, 2 pending friend requests" }),
  ).toBeInTheDocument();
});

it("closes the menu when a destination is chosen", async () => {
  const user = userEvent.setup();
  render(<AppMenuButton />);

  await user.click(screen.getByRole("button", { name: /^Open menu/ }));
  const menu = await screen.findByRole("dialog", { name: "Menu" });
  await user.click(within(menu).getByRole("link", { name: "Feed" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
