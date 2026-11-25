import { describe, expect, it } from "vitest";

import { BOULDER_HUECO, DEFAULT_GRADE_PREFERENCES } from "@/lib/grades";

import { buildYearInReview } from "./build";
import { rankPersonas, type PersonaMetrics } from "./personas";
import { commonAncestor, homeArea } from "./places";
import { yearShareCards } from "./share-cards";
import type { YearAreaMap, YearReviewInput, YearSendRow, YearSessionRow } from "./types";
import { yearReviewWindow } from "./window";

/** Canada(1) › BC(2) › Squamish(3) › Grand Wall(4) / Chief(5); Ontario(6) › Lion's Head(7). */
const AREAS: YearAreaMap = new Map([
  [1, { name: "Canada", path: [1] }],
  [2, { name: "BC", path: [1, 2] }],
  [3, { name: "Squamish", path: [1, 2, 3] }],
  [4, { name: "Grand Wall", path: [1, 2, 3, 4] }],
  [5, { name: "Chief", path: [1, 2, 3, 5] }],
  [6, { name: "Ontario", path: [1, 6] }],
  [7, { name: "Lion's Head", path: [1, 6, 7] }],
  [8, { name: "Italy", path: [8] }],
  [9, { name: "Arco", path: [8, 9] }],
]);

/** Boulder ordinals print through the Hueco table (0 is VB). */
const V = (ordinal: number) => BOULDER_HUECO[ordinal];

let nextClimb = 100;
function send(date: string | null, grade: number, props: Partial<YearSendRow> = {}): YearSendRow {
  nextClimb += 1;
  return {
    climbId: nextClimb,
    climbName: `Climb ${nextClimb}`,
    climbType: "boulder",
    grade,
    areaId: 4,
    ascentStyle: "redpoint",
    dateSent: date,
    rating: 4,
    comment: null,
    ratingSum: 4,
    ratingCount: 1,
    ...props,
  };
}

let nextEntry = 1;
function session(date: string, props: Partial<YearSessionRow> = {}): YearSessionRow {
  nextEntry += 1;
  return {
    id: nextEntry,
    climbId: 900,
    climbName: "The Project",
    climbType: "boulder",
    climbGrade: 9,
    areaId: 4,
    entryDate: date,
    sent: false,
    isAscent: false,
    companions: [],
    ...props,
  };
}

function build(input: Partial<YearReviewInput>) {
  return buildYearInReview(
    { year: 2026, today: "2026-12-15", sends: [], sessions: [], trips: [], areas: AREAS, ...input },
    DEFAULT_GRADE_PREFERENCES,
  );
}

describe("hardest sends", () => {
  it("keeps the top three and every climb tied at the cutoff grade", () => {
    const sends = [7, 7, 6, 6, 6, 5].map((grade, index) => send(`2026-03-0${index + 1}`, grade));
    const [boulder] = build({ sends }).chapters.hardest.disciplines;
    expect(boulder.rows.map((row) => [row.rank, row.label])).toEqual([
      [1, V(7)],
      [1, V(7)],
      [3, V(6)],
      [3, V(6)],
      [3, V(6)],
    ]);
  });

  it("is always present, with an undated-sends note when nothing in the year has a date", () => {
    const review = build({ sends: [send(null, 4), send("2024-05-01", 3)] });
    expect(review.chapters.hardest).toEqual({ disciplines: [], undated: 1 });
    expect(review.chapters.pyramids.disciplines).toEqual([]);
    expect(review.active).toBe(false);
  });
});

describe("places", () => {
  it("finds the deepest shared area, or none across roots", () => {
    expect(
      commonAncestor([
        [1, 2, 3, 4],
        [1, 2, 3, 5],
      ]),
    ).toBe(3);
    expect(commonAncestor([[1, 2, 3, 4]])).toBe(4);
    expect(
      commonAncestor([
        [1, 2, 3, 4],
        [8, 9],
      ]),
    ).toBeNull();
  });

  it("descends into a child only while it holds half the days", () => {
    // BC holds 5 of 6 days, Squamish 5 of 5, and Grand Wall 3 of 5.
    expect(homeArea(AREAS, [4, 4, 4, 5, 5, 7], new Map())?.id).toBe(4);
    // Two walls with 2 days each: the walk stops at the crag above them.
    expect(homeArea(AREAS, [4, 4, 5, 5, 7, 7, 7, 3], new Map())?.id).toBe(3);
    // No child with 3+ days: the climber got around, and the walk stays at the root.
    const spread = homeArea(AREAS, [4, 4, 7, 7], new Map());
    expect(spread).toMatchObject({ id: 1, atRoot: true });
  });

  it("names the day's location from all its climbs", () => {
    const review = build({
      sends: [
        send("2026-05-16", 3, { areaId: 4 }),
        send("2026-05-16", 4, { areaId: 5 }),
        send("2026-05-16", 2, { areaId: 5 }),
      ],
    });
    expect(review.chapters.biggestDay?.rampage?.place?.name).toBe("Squamish");
  });
});

describe("new grades", () => {
  it("counts only steps above every earlier send, including undated ones", () => {
    const sends = [
      send("2025-06-01", 5),
      send(null, 6),
      send("2026-02-01", 6),
      send("2026-04-01", 7),
    ];
    const steps = build({ sends }).chapters.newGrades?.disciplines[0].steps ?? [];
    expect(steps.map((step) => step.label)).toEqual([V(7)]);
  });

  it("starts a first year from the best of its first month", () => {
    const sends = [send("2026-01-05", 1), send("2026-01-20", 3), send("2026-05-01", 5)];
    const [boulder] = build({ sends }).chapters.newGrades?.disciplines ?? [];
    expect(boulder.steps.map((step) => step.label)).toEqual([V(5)]);
    expect(boulder.firstYear).toEqual({ from: V(3), to: V(5) });
  });
});

describe("chapters that need data", () => {
  it("lists a got-away climb and hides partner days below three", () => {
    const pat = { id: "pat", name: "Pat", image: null };
    const review = build({
      sessions: [
        session("2026-03-01", { companions: [pat] }),
        session("2026-04-01", { companions: [pat] }),
      ],
    });
    expect(review.chapters.gotAway).toMatchObject({ climbName: "The Project", sessions: 2 });
    expect(review.chapters.partner).toBeNull();
    expect(review.missed.map((item) => item.id)).toContain("partner");
  });

  it("puts at most three low-rated sends in not worth the pump, unrated excluded", () => {
    const sends = [1, 1, 2, 2, null, 3].map((rating, index) =>
      send(`2026-06-0${index + 1}`, 3, { rating }),
    );
    const climbs = build({ sends }).chapters.notWorthThePump?.climbs ?? [];
    expect(climbs.map((climb) => climb.rating)).toEqual([1, 1, 2]);
  });
});

describe("personas", () => {
  const base: PersonaMetrics = {
    sends: 60,
    daysOut: 30,
    firstTryRate: 0.8,
    siege: null,
    locatedDays: 30,
    homeShare: 0.9,
    homeName: "Squamish",
    tripLocations: 0,
    newClimbs: 10,
    pyramid: null,
    repeats: 0,
    bestWindow: null,
    disciplineShares: [{ type: "boulder", share: 1 }],
  };

  it("always gives at least one persona and never more than three", () => {
    expect(
      rankPersonas({ ...base, sends: 2, firstTryRate: 0, locatedDays: 2 }).map((p) => p.id),
    ).toEqual(["volume-fiend"]);
    expect(rankPersonas({ ...base, repeats: 40 }).length).toBeLessThanOrEqual(3);
  });

  it("doesn't let volume win a persona about something else", () => {
    const heavy = rankPersonas({ ...base, sends: 400, daysOut: 120, firstTryRate: 0.5 });
    const light = rankPersonas({ ...base, sends: 60, firstTryRate: 0.8 });
    const flash = (list: typeof heavy) => list.find((p) => p.id === "flash-machine")?.score ?? 0;
    expect(flash(light)).toBeGreaterThan(flash(heavy));
  });
});

describe("share cards and window", () => {
  it("gives a zero-state core chapter no card", () => {
    const cards = yearShareCards(build({}), "Alex");
    expect(cards.intro).toBeUndefined();
    expect(cards.hardest).toBeUndefined();
  });

  it("opens Dec 1 – Jan 14, January meaning last year", () => {
    expect(yearReviewWindow("2026-11-30")).toBeNull();
    expect(yearReviewWindow("2026-12-01")).toBe(2026);
    expect(yearReviewWindow("2027-01-14")).toBe(2026);
    expect(yearReviewWindow("2027-01-15")).toBeNull();
    expect(yearReviewWindow("2026-06-01", true)).toBe(2026);
  });
});
