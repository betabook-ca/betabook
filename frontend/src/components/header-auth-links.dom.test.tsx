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

  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
});

it("keeps sign-up in the header on narrow screens, leaving sign-in to the menu", () => {
  render(<HeaderAuthLinks />);

  expect(screen.getByRole("link", { name: "Sign up" })).not.toHaveClass("hidden");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveClass("button");
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveClass("hidden", "md:inline-flex");
});

it("leaves the header to Search once signed in", () => {
  state.session = { user: { id: "owner" } };
  render(<HeaderAuthLinks />);

  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
