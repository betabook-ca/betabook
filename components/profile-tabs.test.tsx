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
  // A trip's own pages sit under Trips, whichever of its views is open.
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

it("leaves out only the Journal when the journal is private", () => {
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
