import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ProfileTabs } from "@/components/profile-tabs";

const state = vi.hoisted(() => ({ pathname: "/users/owner/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

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
])("marks %s current among the visible profile sections", (pathname, href, label) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<ProfileTabs userId="owner" showJournal />);

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
  const html = renderToStaticMarkup(<ProfileTabs userId="other" showJournal={false} />);

  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(hrefs(html)).toEqual([
    "/users/other/sends",
    "/users/other/trips",
    "/users/other/analytics",
  ]);
});

it("marks Sends current at the profile root when the journal is hidden", () => {
  state.pathname = "/users/other";
  const html = renderToStaticMarkup(<ProfileTabs userId="other" showJournal={false} />);

  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

const TOKEN = "0123456789abcdef0123456789abcdef";

it.each([
  ["/users/owner", `/users/owner?share=${TOKEN}`, "Sends"],
  ["/users/owner/trips", `/users/owner/trips?share=${TOKEN}`, "Trips"],
  ["/users/owner/trips/7", `/users/owner/trips?share=${TOKEN}`, "Trips"],
])("offers a profile link's holder what the link opens, from %s", (pathname, href, label) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(
    <ProfileTabs userId="owner" showJournal={false} share={TOKEN} />,
  );

  // Each tab link includes the share token.
  expect(hrefs(html)).toEqual([`/users/owner?share=${TOKEN}`, `/users/owner/trips?share=${TOKEN}`]);
  expect(html).toMatch(
    new RegExp(`href="${href.replace("?", "\\?")}"[^>]*aria-current="page"[^>]*>.*?${label}`),
  );
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});
