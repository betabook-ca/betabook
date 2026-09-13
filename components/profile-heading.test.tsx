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

it("titles the profile and lists hardest sends, leaving the logbook summary to Analytics", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" overview={OVERVIEW} />);

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1>/);
  expect(html).toMatch(/Boulder.*V8.*Sport.*5\.12a/s);
  expect(html).not.toContain("180 sends");
  expect(html).not.toContain("Climbing since");
  expect(html).not.toContain("Last out");
});

it("tallies sends beside the name with a spoken discipline breakdown", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" overview={OVERVIEW} />);

  expect(html).toMatch(/>214<\/span>\s*sends/);
  expect(html).toContain("180 boulder, 34 sport");
});

it("shows a note under the name", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      overview={OVERVIEW}
      note={<p>Their journal isn&apos;t shared with you.</p>}
    />,
  );

  expect(html).toContain("Their journal isn&#x27;t shared with you.");
});

it("leaves out hardest sends before anything is logged", () => {
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

  expect(html).not.toContain("Hardest sends");
});
