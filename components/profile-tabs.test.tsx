import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { ProfileTabs } from "@/components/profile-tabs";

const state = vi.hoisted(() => ({ pathname: "/users/owner/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

it.each([
  ["/users/owner", "Journal"],
  ["/users/owner/journal", "Journal"],
  ["/users/owner/sends", "Sends"],
  ["/users/owner/projects", "Projects"],
  ["/users/owner/analytics", "Analytics"],
])("marks %s current among the owner's logbook sections", (pathname, label) => {
  state.pathname = pathname;
  const html = renderToStaticMarkup(<ProfileTabs userId="owner" showJournal showProjects />);

  expect(hrefs(html)).toEqual([
    "/users/owner/journal",
    "/users/owner/sends",
    "/users/owner/projects",
    "/users/owner/analytics",
  ]);
  expect(html).toMatch(
    new RegExp(
      `href="${pathname === "/users/owner" ? "/users/owner/journal" : pathname}"[^>]*aria-current="page"[^>]*>.*?${label}`,
    ),
  );
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

it("keeps Projects off another climber's profile", () => {
  state.pathname = "/users/other/sends";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="other" showJournal={false} showProjects={false} />,
  );

  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(hrefs(html)).toEqual(["/users/other/sends", "/users/other/analytics"]);
});

it("marks Sends current at the profile root when the journal is hidden", () => {
  state.pathname = "/users/other";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="other" showJournal={false} showProjects={false} />,
  );

  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});
