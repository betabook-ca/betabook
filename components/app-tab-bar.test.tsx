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

it("tabs Logbook, Progress, Community and You in that order", () => {
  const html = renderToStaticMarkup(<AppTabs account={account} />);

  expect(hrefs(html)).toEqual(["/users/owner/journal", "/users/owner/goals", "/feed", "/account"]);
  expect(html).toMatch(/>Logbook<.*>Progress<.*>Community<.*>You</s);
});

it.each([
  ["/users/owner", "/users/owner/journal", "location"],
  ["/users/owner/analytics", "/users/owner/goals", "location"],
  ["/feed", "/feed", "page"],
  ["/friends", "/feed", "location"],
  ["/account", "/account", "page"],
  ["/users/other", "/feed", "location"],
])("marks the tab for %s current", (pathname, href, current) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<AppTabs account={account} />);

  expect(link(html, href)).toContain(`aria-current="${current}"`);
  expect(html.match(/aria-current=/g)).toHaveLength(1);
});

it.each(["/areas/1", "/climbs/new"])("marks no tab on %s", (pathname) => {
  state.pathname = pathname;

  expect(renderToStaticMarkup(<AppTabs account={account} />)).not.toContain("aria-current");
});

it("names pending friend requests on the Community tab", () => {
  const html = renderToStaticMarkup(<AppTabs account={account} requestCount={3} />);

  expect(link(html, "/feed")).toContain('aria-label="Community, 3 pending friend requests"');
  expect(link(html, "/feed")).toMatch(/>3</);
  expect(renderToStaticMarkup(<AppTabs account={account} />)).not.toContain("aria-label");
});
