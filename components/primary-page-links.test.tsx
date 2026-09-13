import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { PrimaryPageLinks } from "@/components/primary-page-links";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

it.each(["row", "col"] as const)("gives %s navigation one Add link", (direction) => {
  state.pathname = "/";
  const html = renderToStaticMarkup(<PrimaryPageLinks userId="owner" direction={direction} />);

  expect(hrefs(html)).toEqual(["/climbs/new", "/feed", "/users/owner"]);
  expect(html).toMatch(/<a[^>]*href="\/climbs\/new"[^>]*>.*?Add.*?<\/a>/s);
  expect(html).toContain("Add a climb or area");
  expect(html).not.toContain("aria-haspopup");
});

it.each([
  ["/climbs/new", "page"],
  ["/areas/new", "location"],
])("keeps Add current on %s", (pathname, current) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<PrimaryPageLinks userId="owner" />);

  expect(html).toMatch(new RegExp(`href="/climbs/new"[^>]*aria-current="${current}"`));
  expect(html.match(/aria-current/g)).toHaveLength(1);
});
