import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { AppMenuLinks } from "@/components/app-menu-links";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: () => {} } }));

const owner = { id: "owner", name: "Alex Morgan", image: null, isAdmin: false };
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
const link = (html: string, href: string) =>
  html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>.*?</a>`, "s"))?.[0] ?? "";

beforeEach(() => {
  state.pathname = "/";
});

it("provides primary destinations in the mobile fallback menu", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} />);

  expect(hrefs(html).slice(0, 5)).toEqual([
    "/users/owner/journal",
    "/users/owner/goals",
    "/feed",
    "/search",
    "/climbs/new",
  ]);
  expect(link(html, "/account")).toContain("Alex Morgan");
  expect(link(html, "/climbs/new")).toContain("Add climb or area");
  expect(hrefs(html)).toContain("/account");
  expect(hrefs(html).filter((href) => href === "/account")).toHaveLength(1);
  expect(hrefs(html).find((href) => href.startsWith("/tutorial/journal"))).toBeDefined();
  expect(html).not.toContain("Sign out");
  expect(hrefs(html)).not.toContain("/sign-in");
});

it("names pending friend requests on Community", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} requestCount={2} />);

  expect(link(html, "/feed")).toContain('aria-label="Community, 2 pending friend requests"');
  expect(link(html, "/feed")).toMatch(/>2</);
});

it("places Account settings with desktop utilities immediately before Sign out", () => {
  state.pathname = "/account";
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} surface="sidebar" />);

  expect(hrefs(html).slice(0, 5)).toEqual([
    "/users/owner/journal",
    "/users/owner/goals",
    "/feed",
    "/search",
    "/climbs/new",
  ]);
  expect(hrefs(html).at(-1)).toBe("/account");
  expect(hrefs(html).filter((href) => href === "/account")).toHaveLength(1);
  expect(link(html, "/account")).toContain('aria-current="page"');
  expect(link(html, "/account")).toContain("Alex Morgan");
  expect(html.indexOf("Tutorials")).toBeLessThan(html.indexOf('href="/account"'));
  expect(html.indexOf('href="/account"')).toBeLessThan(html.indexOf("Sign out"));
});

it("leaves Community unlabelled without requests", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} requestCount={0} />);

  expect(link(html, "/feed")).not.toContain("aria-label");
});

it.each([
  [true, 1],
  [false, 0],
])("shows Moderation to admins only (admin: %s)", (isAdmin, count) => {
  const html = renderToStaticMarkup(<AppMenuLinks account={{ ...owner, isAdmin }} />);

  expect(hrefs(html).filter((href) => href === "/admin/requests")).toHaveLength(count);
});

it("offers Add to Home Screen only where the app can be installed", () => {
  expect(renderToStaticMarkup(<AppMenuLinks account={owner} canInstall />)).toContain(
    "Add to Home Screen",
  );
  expect(renderToStaticMarkup(<AppMenuLinks account={owner} />)).not.toContain(
    "Add to Home Screen",
  );
});

it("offers sign-in instead of account links when signed out", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={null} />);

  expect(hrefs(html)).toEqual(["/sign-in", "/sign-up"]);
  for (const href of ["/feed", "/friends", "/climbs/new", "/account"]) {
    expect(hrefs(html)).not.toContain(href);
  }
  expect(html).not.toContain("Sign out");
});

it.each([
  ["/users/owner", "/users/owner/journal", "location"],
  ["/users/owner/sends", "/users/owner/journal", "location"],
  ["/areas/new", "/climbs/new", "location"],
  ["/friends", "/feed", "location"],
  ["/account", "/account", "page"],
])("marks the destination of %s current", (pathname, href, current) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} />);

  expect(link(html, href)).toContain(`aria-current="${current}"`);
  expect(html.match(/aria-current=/g)).toHaveLength(1);
});
