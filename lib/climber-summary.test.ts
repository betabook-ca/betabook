import { expect, it } from "vitest";

import type { ClimberOverview } from "@/db/queries/climber-overview";
import { describeClimber, describeRecency } from "@/lib/climber-summary";

const OVERVIEW: ClimberOverview = {
  sendCount: 214,
  areaCount: 18,
  hardest: [{ type: "boulder", grade: "V8", sendCount: 180 }],
  firstYear: 2019,
  daysOut: 96,
  lastOut: "2026-03-03",
  daysThisMonth: 2,
  month: "2026-03",
};

it("summarizes a logbook the viewer can read", () => {
  expect(describeClimber(OVERVIEW)).toBe(
    "Climbing since 2019. 214 sends across 18 areas, 96 days out.",
  );
  expect(describeRecency(OVERVIEW)).toBe("Last out Mar 3, 2026. 2 days out in March.");
});

it("counts sends for a viewer who can't read the journal", () => {
  const hidden = { ...OVERVIEW, daysOut: null, lastOut: "2026-03-04" };

  expect(describeClimber(hidden)).toBe("Climbing since 2019. 214 sends across 18 areas.");
  expect(describeRecency(hidden)).toBe("Last sent Mar 4, 2026. 2 sending days in March.");
});

it("leaves the month out when nothing was logged in it", () => {
  expect(describeRecency({ ...OVERVIEW, lastOut: "2026-02-20", daysThisMonth: 0 })).toBe(
    "Last out Feb 20, 2026.",
  );
});

it("describes a climber with nothing logged", () => {
  const empty: ClimberOverview = {
    sendCount: 0,
    areaCount: 0,
    hardest: [],
    firstYear: null,
    daysOut: 0,
    lastOut: null,
    daysThisMonth: 0,
    month: "2026-03",
  };

  expect(describeClimber(empty)).toBe("No sends logged yet.");
  expect(describeRecency(empty)).toBeNull();
});
