import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ProfileTabs } from "@/components/profile-tabs";

const state = vi.hoisted(() => ({ pathname: "/users/owner/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

const TOKEN = "0123456789abcdef0123456789abcdef";

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

it.each([
  ["/users/owner", "/users/owner/journal", "Journal"],
  ["/users/owner/journal", "/users/owner/journal", "Journal"],
  ["/users/owner/sends", "/users/owner/sends", "Sends"],
  ["/users/owner/trips", "/users/owner/trips", "Trips"],
  // Trip pages keep the Trips tab selected.
  ["/users/owner/trips/7", "/users/owner/trips", "Trips"],
  ["/users/owner/trips/7/sends", "/users/owner/trips", "Trips"],
  ["/users/owner/analytics", "/users/owner/analytics", "Analytics"],
])("marks the right tab as current for %s", (pathname, href, label) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<ProfileTabs userId="owner" showJournal showTrips />);

  expect(hrefs(html)).toEqual([
    "/users/owner/journal",
    "/users/owner/sends",
    "/users/owner/trips",
    "/users/owner/analytics",
  ]);
  expect(html).toMatch(new RegExp(`href="${href}"[^>]*aria-current="page"[^>]*>.*?${label}`));
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

it("hides only the Journal tab when the journal is private", () => {
  state.pathname = "/users/other/sends";
  const html = renderToStaticMarkup(<ProfileTabs userId="other" showJournal={false} showTrips />);

  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(hrefs(html)).toEqual([
    "/users/other/sends",
    "/users/other/trips",
    "/users/other/analytics",
  ]);
});

it("hides only the Trips tab when the trips aren't shared with the viewer", () => {
  state.pathname = "/users/other/sends";
  const html = renderToStaticMarkup(<ProfileTabs userId="other" showJournal showTrips={false} />);

  expect(hrefs(html)).toEqual([
    "/users/other/journal",
    "/users/other/sends",
    "/users/other/analytics",
  ]);
});

it("marks Sends current at the profile root when the journal is hidden", () => {
  state.pathname = "/users/other";
  const html = renderToStaticMarkup(<ProfileTabs userId="other" showJournal={false} showTrips />);

  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

it("shows only Sends with a share token, since trips have their own links", () => {
  state.pathname = "/users/owner";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="owner" showJournal={false} showTrips={false} share={TOKEN} />,
  );

  // The tab link includes the share token.
  expect(hrefs(html)).toEqual([`/users/owner?share=${TOKEN}`]);
  expect(html).toMatch(
    new RegExp(`href="/users/owner\\?share=${TOKEN}"[^>]*aria-current="page"[^>]*>.*?Sends`),
  );
});
