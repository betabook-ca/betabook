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

it("leads with the climber's profile, then Feed, Friends and Add climb/area", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} />);

  expect(hrefs(html).slice(0, 4)).toEqual(["/users/owner", "/feed", "/friends", "/climbs/new"]);
  expect(link(html, "/users/owner")).toContain("Alex Morgan");
  expect(link(html, "/climbs/new")).toContain("Add climb/area");
  expect(hrefs(html)).toEqual(
    expect.arrayContaining(["/account", "/about", "/costs", "/contact", "/terms"]),
  );
  expect(hrefs(html).find((href) => href.startsWith("/tutorial/journal"))).toBeDefined();
  expect(html).not.toContain("Theme");
  expect(html).toContain("Sign out");
  expect(hrefs(html)).not.toContain("/sign-in");
});

it("names pending friend requests on Friends", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} requestCount={2} />);

  expect(link(html, "/friends")).toContain('aria-label="Friends, 2 pending friend requests"');
  expect(link(html, "/friends")).toMatch(/>2</);
});

it("leaves Friends unlabelled without requests", () => {
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} requestCount={0} />);

  expect(link(html, "/friends")).not.toContain("aria-label");
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

  expect(hrefs(html).slice(0, 2)).toEqual(["/sign-in", "/sign-up"]);
  for (const href of ["/feed", "/friends", "/climbs/new", "/account"]) {
    expect(hrefs(html)).not.toContain(href);
  }
  expect(html).not.toContain("Theme");
  expect(html).not.toContain("Sign out");
});

it.each([
  ["/users/owner", "/users/owner", "page"],
  ["/users/owner/sends", "/users/owner", "location"],
  ["/areas/new", "/climbs/new", "location"],
  ["/friends", "/friends", "page"],
  ["/account", "/account", "page"],
])("marks the destination of %s current", (pathname, href, current) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<AppMenuLinks account={owner} />);

  expect(link(html, href)).toContain(`aria-current="${current}"`);
  expect(html.match(/aria-current=/g)).toHaveLength(1);
});
