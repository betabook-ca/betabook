import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { DisciplineScopeNav } from "./discipline-scope-nav";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));

const href = (type: string) => `/analytics?discipline=${type}`;

it("links each logged discipline as a pill and marks the current one", () => {
  const html = renderToStaticMarkup(
    <DisciplineScopeNav present={["boulder", "sport"]} scope="sport" href={href} />,
  );
  expect(html).toContain('<nav aria-label="Discipline"');
  expect(html).toMatch(
    /<a href="\/analytics\?discipline=boulder"(?![^>]*aria-current)[^>]*>Boulder<\/a>/,
  );
  expect(html).toMatch(
    /<a href="\/analytics\?discipline=sport" aria-current="true"[^>]*>Sport<\/a>/,
  );
  expect(html).not.toContain("Trad");
});

it("renders nothing when there is only one discipline to choose from", () => {
  expect(
    renderToStaticMarkup(<DisciplineScopeNav present={["boulder"]} scope="boulder" href={href} />),
  ).toBe("");
});
