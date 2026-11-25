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
  it("caps each list at three, ties sharing a rank and the earliest send first", () => {
    const sends = [7, 7, 6, 6, 6, 5].map((grade, index) => send(`2026-03-0${index + 1}`, grade));
    const review = build({ sends });
    const [boulder] = review.chapters.hardest.disciplines;
    expect(boulder.rows.map((row) => [row.rank, row.label, row.dateSent])).toEqual([
      [1, V(7), "2026-03-01"],
      [1, V(7), "2026-03-02"],
      [3, V(6), "2026-03-03"],
    ]);
    const flashes = [8, 8, 8, 8].map((grade, index) =>
      send(`2026-04-0${index + 1}`, grade, { ascentStyle: "flash" }),
    );
    const [flashed] = build({ sends: flashes }).chapters.flashes?.disciplines ?? [];
    expect(flashed.rows.map((row) => row.rank)).toEqual([1, 1, 1]);
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
    // Grand Wall and Chief: each climb's own area counts once.
    expect(review.chapters.intro.areasVisited).toBe(2);
  });
});

describe("new ground", () => {
  it("lists first-visit areas by days there, collapsed, abroad included", () => {
    const review = build({
      sends: [
        // Ontario was climbed before, so Canada isn't new; BC is.
        send("2025-06-01", 3, { areaId: 7 }),
        send("2026-03-01", 3, { areaId: 4 }),
        send("2026-03-02", 3, { areaId: 4 }),
        send("2026-03-03", 3, { areaId: 5 }),
        send("2026-04-01", 3, { areaId: 5 }),
        // Italy is a new root: its crag, Arco, counts instead.
        send("2026-08-01", 3, { areaId: 9 }),
        send("2026-08-02", 3, { areaId: 9 }),
        // A day back at a known area adds no new ground.
        send("2026-09-01", 3, { areaId: 7 }),
      ],
    });
    const ground = review.chapters.newGround;
    expect(ground?.firstVisits.map(({ place, days }) => [place.name, days])).toEqual([
      ["BC", 4],
      ["Arco", 2],
    ]);
    expect(ground).toMatchObject({ areas: 2, days: 6 });
  });

  it("keeps the five areas with the most days", () => {
    const many = new Map<number, { name: string; path: number[] }>([
      [1, { name: "Root", path: [1] }],
    ]);
    for (let index = 0; index < 7; index += 1) {
      many.set(index + 10, { name: `Crag ${index}`, path: [1, index + 10] });
    }
    const sends = Array.from({ length: 7 }, (_, index) =>
      Array.from({ length: index + 1 }, (_, day) =>
        send(`2026-0${index + 1}-${String(day + 1).padStart(2, "0")}`, 3, { areaId: index + 10 }),
      ),
    ).flat();
    const ground = build({ sends, areas: many }).chapters.newGround;
    expect(ground?.areas).toBe(7);
    expect(ground?.firstVisits.map(({ place }) => place.name)).toEqual([
      "Crag 6",
      "Crag 5",
      "Crag 4",
      "Crag 3",
      "Crag 2",
    ]);
  });
});

describe("trips", () => {
  it("groups this year's trips into highlights, each with its own trips", () => {
    const trip = (id: number, startDate: string, endDate: string) => ({
      id,
      name: `Trip ${id}`,
      startDate,
      endDate,
    });
    const review = build({
      trips: [
        trip(1, "2024-08-01", "2024-08-03"),
        trip(2, "2026-03-01", "2026-03-05"),
        trip(3, "2026-06-01", "2026-06-02"),
        trip(4, "2026-09-01", "2026-09-01"),
      ],
      sends: [
        send("2024-08-01", 3, { areaId: 9 }),
        // Two Squamish trips this year, the first the bigger one.
        ...["2026-03-01", "2026-03-02", "2026-03-03"].map((date) => send(date, 3, { areaId: 4 })),
        // Both walls, so this trip's location is Squamish, which contains
        // the first trip's Grand Wall. Sibling walls alone wouldn't group.
        send("2026-06-01", 3, { areaId: 4 }),
        send("2026-06-02", 3, { areaId: 5 }),
        // Back to Arco, first visited on the 2024 trip.
        send("2026-09-01", 3, { areaId: 9 }),
      ],
    });
    const trips = review.chapters.trips;
    expect(trips?.biggest?.id).toBe(2);
    expect(trips?.returnTrip).toMatchObject({ trip: { id: 4 }, visit: 2, firstYear: 2024 });
    expect(
      trips?.repeatedPlaces.map((group) => [group.name, group.trips.map((card) => card.id)]),
    ).toEqual([["Squamish", [2, 3]]]);
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
    expect(review.chapters.gotAway?.climbs).toMatchObject([
      { climbName: "The Project", sessions: 2 },
    ]);
    expect(review.chapters.partner).toBeNull();
    expect(review.missed.map((item) => item.id)).toContain("partner");
  });

  it("lists up to three unsent climbs, most sessions first, sent ones excluded", () => {
    const tries = (climbId: number, dates: string[]) =>
      dates.map((date) => session(date, { climbId, climbName: `Project ${climbId}` }));
    const review = build({
      sends: [send("2026-09-01", 9, { climbId: 5 })],
      sessions: [
        ...tries(1, ["2026-02-01", "2026-03-01"]),
        ...tries(2, ["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"]),
        ...tries(3, ["2026-02-01", "2026-03-01", "2026-06-01"]),
        ...tries(4, ["2026-01-01", "2026-01-08"]),
        ...tries(5, ["2026-02-01", "2026-03-01", "2026-04-01"]),
        ...tries(6, ["2026-07-01"]),
      ],
    });
    // 5 was sent and 6 was tried once; 1 and 4 tie on sessions, 1 more recently.
    expect(review.chapters.gotAway?.climbs.map((climb) => climb.climbId)).toEqual([2, 3, 1]);
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
