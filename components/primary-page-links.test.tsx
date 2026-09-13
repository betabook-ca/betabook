import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { PrimaryPageLinks } from "@/components/primary-page-links";

vi.mock("next/navigation", () => ({ usePathname: () => "/climbs/new" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

it("folds Add climb and Add area into one Add menu in the header", () => {
  const html = renderToStaticMarkup(<PrimaryPageLinks userId="owner" />);

  expect(hrefs(html)).toEqual(["/feed", "/users/owner"]);
  expect(html).toMatch(/<button[^>]*aria-haspopup[^>]*>.*Add.*?<\/button>/s);
});

it("keeps both create pages as rows in the side menu", () => {
  const html = renderToStaticMarkup(<PrimaryPageLinks userId="owner" direction="col" />);

  expect(hrefs(html)).toEqual(["/climbs/new", "/areas/new", "/feed", "/users/owner"]);
  expect(html).not.toContain("aria-haspopup");
});
