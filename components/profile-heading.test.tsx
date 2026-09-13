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

const badges = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));

it("titles the profile and leaves the logbook summary to Analytics", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" overview={OVERVIEW} />);

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1>/);
  expect(html).not.toContain("Climbing since");
  expect(html).not.toContain("Last out");
});

it("badges the hardest grade per discipline without send counts", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" overview={OVERVIEW} />);

  expect(badges(html)).toEqual(["BoulderV8", "Sport5.12a"]);
  expect(html).not.toContain("214");
  expect(html).not.toContain("180");
});

it("keeps a name action on the name's row, above the badges", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading
      name="Alex Morgan"
      overview={OVERVIEW}
      nameAction={<button type="button">Copy profile link</button>}
    />,
  );

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1><button[^>]*>Copy profile link<\/button>/);
  expect(html.indexOf("Copy profile link")).toBeLessThan(html.indexOf("Hardest sends"));
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

it("leaves out badges before anything is logged", () => {
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
  expect(badges(html)).toEqual([]);
});
