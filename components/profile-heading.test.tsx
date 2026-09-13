import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import type { ClimberOverview } from "@/db/queries/climber-overview";

import { ProfileHeading } from "./profile-heading";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const OVERVIEW: ClimberOverview = {
  sendCount: 214,
  areaCount: 18,
  hardest: [
    { type: "boulder", grade: "V8", sendCount: 180 },
    { type: "sport", grade: "5.12a", sendCount: 34 },
  ],
  firstYear: 2019,
  daysOut: 96,
  lastOut: "2026-03-03",
  daysThisMonth: 2,
  month: "2026-03",
};

it("titles the profile with the climber and summarizes their logbook once", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading name="Alex Morgan" overview={OVERVIEW} analyticsHref="/users/alex/analytics" />,
  );

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1>/);
  expect(html).toContain("Climbing since 2019. 214 sends across 18 areas, 96 days out.");
  expect(html).toContain("Last out Mar 3, 2026. 2 days out in March.");
  expect(html).toMatch(/href="\/users\/alex\/analytics"[^>]*>See analytics</);
  expect(html).toMatch(/Boulder.*V8.*180 sends.*Sport.*5\.12a.*34 sends/s);
  expect(html).not.toContain("last 12 months");
});

it("counts sends for a visitor who can't read the journal", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      overview={{ ...OVERVIEW, daysOut: null, lastOut: "2026-03-04" }}
    />,
  );

  expect(html).toContain("Climbing since 2019. 214 sends across 18 areas.");
  expect(html).toContain("Last sent Mar 4, 2026. 2 sending days in March.");
  expect(html).not.toContain("days out");
});

it("leaves the month out when nothing was logged in it", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      overview={{ ...OVERVIEW, lastOut: "2026-02-20", daysThisMonth: 0 }}
    />,
  );

  expect(html).toContain("Last out Feb 20, 2026.");
  expect(html).not.toContain("in March");
});

it("leaves out hardest sends and recency before anything is logged", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      overview={{
        sendCount: 0,
        areaCount: 0,
        hardest: [],
        firstYear: null,
        daysOut: 0,
        lastOut: null,
        daysThisMonth: 0,
        month: "2026-03",
      }}
    />,
  );

  expect(html).toContain("No sends logged yet.");
  expect(html).not.toContain("Hardest sends");
  expect(html).not.toContain("Last out");
});
