import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { NavLink } from "./nav-link";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));

it.each([
  ["/users/alice", "page"],
  ["/users/alice/journal", "location"],
  ["/users/alice/sends", "location"],
  ["/feed", "location"],
  ["/users/bob", undefined],
  ["/users/alice-other", undefined],
])("keeps the link visible with the correct current state on %s", (pathname, current) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(
    <NavLink href="/users/alice" matchWithin relatedPaths={["/feed"]}>
      My profile
    </NavLink>,
  );
  expect(html).toContain('href="/users/alice"');
  expect(html).toContain(">My profile</a>");
  if (current) expect(html).toContain(`aria-current="${current}"`);
  else expect(html).not.toContain("aria-current=");
});
