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

  expect(html).not.toContain("<h2");
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

  expect(html).not.toContain("<h2");
  expect(html).toContain('href="/users/other/sends" aria-current="page"');
  expect(hrefs(html)).toEqual(["/users/other/sends", "/users/other/analytics"]);
});

it("calls another person's journal Journal", () => {
  state.pathname = "/users/other/journal";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="other" showJournal showProjects={false} />,
  );
  expect(html).toMatch(/href="\/users\/other\/journal"[^>]*>Journal<\/a>/);
  expect(html).not.toContain("My Journal");
});

it("counts sends on the Sends tab", () => {
  state.pathname = "/users/owner";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="owner" showJournal showProjects sendCount={960} />,
  );

  expect(html).toMatch(/href="\/users\/owner\/sends"[^>]*>Sends<span[^>]*>960<\/span><\/a>/);
});

it("leaves the Sends count off before anything is sent", () => {
  state.pathname = "/users/owner";
  const html = renderToStaticMarkup(
    <ProfileTabs userId="owner" showJournal showProjects sendCount={0} />,
  );

  expect(html).toMatch(/href="\/users\/owner\/sends"[^>]*>Sends<\/a>/);
});
