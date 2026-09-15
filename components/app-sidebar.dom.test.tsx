import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

import { SidebarLayout } from "./app-sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/feed", useRouter: () => ({}) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

it("reveals labels on hover, can pin the sidebar, and collapses explicitly", async () => {
  const user = userEvent.setup();
  render(
    <SidebarLayout account={{ id: "sample", name: "Alex Morgan", isAdmin: true }} requestCount={3}>
      <button type="button">Page content</button>
    </SidebarLayout>,
  );
  const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("link", { name: /^Community/ })).toHaveAttribute("aria-current", "page");
  expect(
    screen.getByRole("link", { name: "Community, 3 pending friend requests" }),
  ).toHaveAttribute("href", "/feed");
  await user.hover(sidebar);
  const pin = screen.getByRole("button", { name: "Keep sidebar expanded" });
  expect(pin).toHaveAttribute("aria-expanded", "true");
  await user.click(pin);
  await user.hover(screen.getByRole("button", { name: "Page content" }));
  await user.click(screen.getByRole("button", { name: "Page content" }));
  expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

it("reveals keyboard navigation and closes the preview when focus leaves", async () => {
  const user = userEvent.setup();
  render(
    <SidebarLayout account={null}>
      <button type="button">Page content</button>
    </SidebarLayout>,
  );
  await user.tab();
  expect(screen.getByRole("button", { name: "Keep sidebar expanded" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Page content" }));
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
