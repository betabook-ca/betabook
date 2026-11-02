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
  expect(result.biggestProject).toMatchObject({ id: 1, sessions: 3 });
  expect(result.persistence).toMatchObject({ id: 1, sessions: 3 });
  expect(result.favoriteRepeat).toMatchObject({ id: 1, repeats: 1 });
  expect(buildAnalyticsHighlights(rows, "boulder", [2024]).persistence).toBeNull();
  expect(buildAnalyticsHighlights(rows, "boulder", [2023])).toEqual({
    partner: null,
    biggestProject: null,
    persistence: null,
    favoriteRepeat: null,
  });
});

it("leaves sessions after the first send out of the biggest project", () => {
  const rows = [
    session(1, "2025-01-06", { sent: true, isAscent: true }),
    session(2, "2025-01-13", { sent: true }),
    session(3, "2025-01-20"),
    session(4, "2025-01-27", { sent: true }),
    session(5, "2025-01-06", { climbId: 2, climbName: "Open project" }),
    session(6, "2025-01-13", { climbId: 2, climbName: "Open project" }),
  ];
  expect(buildAnalyticsHighlights(rows, "boulder", []).biggestProject).toMatchObject({
    id: 2,
    sessions: 2,
    firstSend: null,
  });
});

it("ignores a climb sent before the selected years", () => {
  const rows = [
    session(1, "2024-06-01"),
    session(2, "2024-06-08", { sent: true, isAscent: true }),
    session(3, "2025-01-06", { sent: true }),
    session(4, "2025-01-13"),
  ];
  const result = buildAnalyticsHighlights(rows, "boulder", [2025]);
  expect(result.biggestProject).toBeNull();
  expect(result.favoriteRepeat).toMatchObject({ id: 1, repeats: 1 });
  expect(buildAnalyticsHighlights(rows, "boulder", [2024]).biggestProject).toMatchObject({
    id: 1,
    sessions: 2,
    firstSend: "2024-06-08",
  });
});
