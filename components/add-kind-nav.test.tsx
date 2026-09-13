import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AddKindNav } from "@/components/add-kind-nav";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

it.each([
  ["climb", "/climbs/new", "Climb"],
  ["area", "/areas/new", "Area"],
] as const)("switches between the create forms with %s current", (current, href, label) => {
  const html = renderToStaticMarkup(<AddKindNav current={current} />);

  expect(html).toContain('aria-label="What to add"');
  expect(
    [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => [
      match[1],
      match[2],
    ]),
  ).toEqual([
    ["/climbs/new", "Climb"],
    ["/areas/new", "Area"],
  ]);
  expect(html).toMatch(new RegExp(`href="${href}"[^>]*aria-current="page"[^>]*>${label}<`));
  expect(html.match(/aria-current/g)).toHaveLength(1);
});
