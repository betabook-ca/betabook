import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import type { ClimberOverview } from "@/db/queries/climber-overview";
import { buildSeason } from "@/lib/climber-season";

import { ProfileHeading } from "./profile-heading";

const OVERVIEW: ClimberOverview = {
  sendCount: 214,
  areaCount: 18,
  hardest: [
    { type: "boulder", grade: "V8", sendCount: 180 },
    { type: "sport", grade: "5.12a", sendCount: 34 },
  ],
  firstYear: 2019,
  daysOut: 96,
  season: buildSeason(["2026-02-24", "2026-03-02", "2026-03-03"], "2026-03-06"),
};

it("titles the profile with the climber and summarizes their logbook once", () => {
  const html = renderToStaticMarkup(<ProfileHeading name="Alex Morgan" overview={OVERVIEW} />);

  expect(html).toMatch(/<h1[^>]*>Alex Morgan<\/h1>/);
  expect(html).toContain("Climbing since 2019. 214 sends across 18 areas, 96 days out.");
  expect(html).toMatch(/Boulder.*V8.*180 sends.*Sport.*5\.12a.*34 sends/s);
  expect(html).toContain("3 days out in the last 12 months");
});

it("counts sending days for a visitor who can't read the journal", () => {
  const html = renderToStaticMarkup(
    <ProfileHeading name="Alex Morgan" overview={{ ...OVERVIEW, daysOut: null }} />,
  );

  expect(html).toContain("Climbing since 2019. 214 sends across 18 areas.");
  expect(html).toContain("3 sending days in the last 12 months");
  expect(html).not.toContain("days out");
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
        season: buildSeason([], "2026-03-06"),
      }}
    />,
  );

  expect(html).toContain("No sends logged yet.");
  expect(html).not.toContain("Hardest sends");
  expect(html).toContain("No days out in the last 12 months");
});
