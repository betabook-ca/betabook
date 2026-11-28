import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { HeaderAuthLinks } from "./header-auth-links";

const state = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
vi.mock("@/spa/lib/navigation", () => ({ usePathname: () => "/about" }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: state.session, isPending: false }) },
}));

beforeEach(() => {
  state.session = null;
});

it("offers sign-in and sign-up in the header when signed out", () => {
  render(<HeaderAuthLinks />);

  for (const link of screen.getAllByRole("link", { name: "Sign in" }))
    expect(link).toHaveAttribute("href", "/sign-in");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
});

it("keeps one sign-in button in the header on narrow screens, leaving sign-up to that page", () => {
  render(<HeaderAuthLinks />);

  const [narrow, wide] = screen.getAllByRole("link", { name: "Sign in" });
  expect(narrow).toHaveClass("button", "md:hidden");
  expect(narrow).toHaveAttribute("href", "/sign-in");
  expect(wide).toHaveClass("hidden", "md:inline-flex");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveClass("hidden", "md:inline-flex");
});

it("leaves the header to Search once signed in", () => {
  state.session = { user: { id: "owner" } };
  render(<HeaderAuthLinks />);

  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
