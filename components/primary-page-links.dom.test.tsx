import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

import { PrimaryPageLinks } from "./primary-page-links";

vi.mock("next/navigation", () => ({ usePathname: () => "/users/owner" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

it("offers both create pages from the header's Add menu", async () => {
  const user = userEvent.setup();
  render(<PrimaryPageLinks userId="owner" />);

  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add" }));

  expect(await screen.findByRole("menuitem", { name: "Climb" })).toHaveAttribute(
    "href",
    "/climbs/new",
  );
  expect(screen.getByRole("menuitem", { name: "Area" })).toHaveAttribute("href", "/areas/new");
});
