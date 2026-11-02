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
  const result = buildAnalyticsHighlights(rows, "boulder", [2025], []);
  expect(result.partner).toEqual({ id: "pat", name: "Pat", days: 4 });
  expect(result.biggestProject).toMatchObject({ id: 2, sessions: 1, firstSend: null });
  expect(result.persistence).toMatchObject({ id: 1, sessions: 3 });
  expect(result.favoriteRepeat).toMatchObject({ id: 1, repeats: 1 });
  expect(buildAnalyticsHighlights(rows, "boulder", [2024], []).persistence).toBeNull();
  expect(buildAnalyticsHighlights(rows, "boulder", [2023], [])).toEqual({
    partner: null,
    biggestProject: null,
    persistence: null,
    favoriteRepeat: null,
  });
});

it("only counts climbs without a send as the biggest project", () => {
  const rows = [
    session(1, "2025-01-06"),
    session(2, "2025-01-13"),
    session(3, "2025-01-20", { sent: true, isAscent: true }),
    session(4, "2025-01-27", { sent: true }),
    session(5, "2025-01-06", { climbId: 2, climbName: "Open project" }),
    session(6, "2025-01-13", { climbId: 2, climbName: "Open project" }),
  ];
  const result = buildAnalyticsHighlights(rows, "boulder", [], []);
  expect(result.biggestProject).toMatchObject({ id: 2, sessions: 2, firstSend: null });
  expect(result.persistence).toMatchObject({ id: 1, sessions: 3 });
  expect(buildAnalyticsHighlights(rows.slice(0, 4), "boulder", [], []).biggestProject).toBeNull();
});

it("treats a climb as a project until the end of the selected years", () => {
  const rows = [
    session(1, "2024-06-01"),
    session(2, "2024-06-08"),
    session(3, "2025-03-01", { sent: true, isAscent: true }),
    session(4, "2026-01-06", { sent: true }),
  ];
  expect(buildAnalyticsHighlights(rows, "boulder", [2024], []).biggestProject).toMatchObject({
    id: 1,
    sessions: 2,
  });
  expect(buildAnalyticsHighlights(rows, "boulder", [2024, 2025], []).biggestProject).toBeNull();
  expect(buildAnalyticsHighlights(rows, "boulder", [2026], []).biggestProject).toBeNull();
});

it("counts a send without a journal entry as sent", () => {
  const rows = [
    session(1, "2024-05-01"),
    session(2, "2024-05-08"),
    session(3, "2024-05-01", { climbId: 2, climbName: "Undated send" }),
    session(4, "2024-05-01", { climbId: 3, climbName: "Sent in 2025" }),
  ];
  const sends = [
    { climbId: 1, dateSent: "2024-06-01" },
    { climbId: 2, dateSent: null },
    { climbId: 3, dateSent: "2025-02-01" },
  ];
  expect(buildAnalyticsHighlights(rows, "boulder", [2024], sends).biggestProject).toMatchObject({
    id: 3,
    sessions: 1,
  });
  expect(buildAnalyticsHighlights(rows, "boulder", [], sends).biggestProject).toBeNull();
});
