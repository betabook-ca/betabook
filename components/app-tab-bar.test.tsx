import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { AppTabs } from "@/components/app-tab-bar";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));

const account = { id: "owner", name: "Alex Morgan", image: null };
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
const link = (html: string, href: string) =>
  html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>.*?</a>`, "s"))?.[0] ?? "";

beforeEach(() => {
  state.pathname = "/";
});

it("tabs Profile, Feed and Friends in that order", () => {
  const html = renderToStaticMarkup(<AppTabs account={account} />);

  expect(hrefs(html)).toEqual(["/users/owner", "/feed", "/friends"]);
  expect(html).toMatch(/>Profile<.*>Feed<.*>Friends</s);
});

it.each([
  ["/users/owner", "/users/owner", "page"],
  ["/users/owner/analytics", "/users/owner", "location"],
  ["/feed", "/feed", "page"],
  ["/friends", "/friends", "page"],
])("marks the tab for %s current", (pathname, href, current) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<AppTabs account={account} />);

  expect(link(html, href)).toContain(`aria-current="${current}"`);
  expect(html.match(/aria-current=/g)).toHaveLength(1);
});

it.each(["/users/other", "/account", "/climbs/new"])("marks no tab on %s", (pathname) => {
  state.pathname = pathname;

  expect(renderToStaticMarkup(<AppTabs account={account} />)).not.toContain("aria-current");
});

it("names pending friend requests on the Friends tab", () => {
  const html = renderToStaticMarkup(<AppTabs account={account} requestCount={3} />);

  expect(link(html, "/friends")).toContain('aria-label="Friends, 3 pending friend requests"');
  expect(link(html, "/friends")).toMatch(/>3</);
  expect(renderToStaticMarkup(<AppTabs account={account} />)).not.toContain("aria-label");
});
