import { expect, it } from "vitest";

import { buildAnalyticsHighlights, type HighlightSession } from "./analytics-highlights";
const session = (
  id: number,
  date: string,
  props: Partial<HighlightSession> = {},
): HighlightSession => ({
  id,
  entryDate: date,
  climbId: 1,
  climbName: "Project",
  climbType: "boulder",
  sent: false,
  isAscent: false,
  companions: [{ id: "pat", name: "Pat" }],
  ...props,
});
it("counts shared days, sessions, first-send effort, and repeats within selected years", () => {
  const rows = [
    session(1, "2024-12-20"),
    session(2, "2025-01-06"),
    session(3, "2025-01-06"),
    session(4, "2025-01-13", { sent: true, isAscent: true }),
    session(5, "2025-01-20", { sent: true }),
    session(6, "2025-02-10", { climbId: 2 }),
    session(7, "2025-01-27", { climbType: "sport" }),
  ];
  const result = buildAnalyticsHighlights(rows, "boulder", [2025]);
  expect(result.partner).toEqual({ id: "pat", name: "Pat", days: 4 });
  expect(result.biggestProject).toMatchObject({ id: 1, sessions: 4 });
  expect(result.persistence).toMatchObject({ id: 1, attempts: 3 });
  expect(result.favoriteRepeat).toMatchObject({ id: 1, repeats: 1 });
  expect(buildAnalyticsHighlights(rows, "boulder", [2024]).persistence).toBeNull();
  expect(buildAnalyticsHighlights(rows, "boulder", [2023])).toEqual({
    partner: null,
    biggestProject: null,
    persistence: null,
    favoriteRepeat: null,
  });
});
