import { DISCIPLINE_NAMES } from "./labels";
import type { PersonaId, PersonaResult } from "./types";

/** The year's facts the personas read. Every rate is 0–1. */
export type PersonaMetrics = {
  sends: number;
  /** The median day out by `dayScore`, repeats included and days without a
   * send counted as empty, so one huge day can't make a typical one big. */
  typicalDay: { boulders: number; routes: number; days: number } | null;
  firstTryRate: number;
  /** Most sessions on one climb at the climber's limit or one that got away. */
  siege: { climbName: string; sessions: number } | null;
  locatedDays: number;
  /** The home area's share of located days. */
  homeShare: number;
  homeName: string | null;
  tripLocations: number;
  newClimbs: number;
  pyramid: {
    tiers: number;
    base: number;
    top: number;
    /** Fraction of adjacent tiers where the lower grade has at least as many sends. */
    shape: number;
    counts: number[];
    from: string;
    to: string;
    sends: number;
  } | null;
  repeats: number;
  bestWindow: { share: number; sends: number; from: string; to: string } | null;
  disciplineShares: { type: keyof typeof DISCIPLINE_NAMES; share: number }[];
};

/** Every factor is capped, so no ratio grows without bound and volume can't
 * win a persona that is about something else. */
const CAP = 1.5;
const cap = (value: number) => Math.max(0, Math.min(value, CAP));
/** A geometric mean: one weak factor pulls the score down more than an
 * arithmetic mean would let it. */
const geometricMean = (values: number[]) =>
  values.reduce((total, value) => total * value, 1) ** (1 / values.length);

/** How big a day was: eight problems, or six routes, scores 1. */
export function dayScore(boulders: number, routes: number): number {
  return boulders / 8 + routes / 6;
}

/** All-Rounder full marks at an even split, 1 at a 15-point gap between the
 * biggest and smallest share, nothing from a 45-point gap. */
const ALL_ROUNDER_ZERO_SPREAD = 0.45;
const ALL_ROUNDER_SPREAD_STEP = 0.3;

/** Population percentile breakpoints per persona (raw affinity at each 5th
 * percentile), generated from the weekly export before launch. Until a
 * persona has a table its raw affinity is compared directly, where 1.0 is
 * the old qualifying gate. */
const PERCENTILE_BREAKPOINTS: Partial<Record<PersonaId, readonly number[]>> = {};

function percentile(id: PersonaId, raw: number): number {
  const table = PERCENTILE_BREAKPOINTS[id];
  if (!table?.length) return raw;
  const below = table.filter((breakpoint) => breakpoint <= raw).length;
  return (below / table.length) * 100;
}

/** Ties go to the rarer persona first. */
const PRIORITY: PersonaId[] = [
  "siege-mentality",
  "pyramid-builder",
  "circuit-repeater",
  "seasonal-sprinter",
  "all-rounder",
  "wanderer",
  "flash-machine",
  "volume-fiend",
];

const PERSONA_NAMES: Record<PersonaId, string> = {
  "volume-fiend": "The Volume Fiend",
  "flash-machine": "The Flash Machine",
  "siege-mentality": "The Siege Mentality",
  wanderer: "The Wanderer",
  "pyramid-builder": "The Pyramid Builder",
  "circuit-repeater": "The Circuit Repeater",
  "seasonal-sprinter": "The Seasonal Sprinter",
  "all-rounder": "The All-Rounder",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

type Candidate = { id: PersonaId; raw: number; why: string };

function typicalDayWhy(day: NonNullable<PersonaMetrics["typicalDay"]>): string {
  const parts = [
    day.boulders ? plural(day.boulders, "problem") : "",
    day.routes ? plural(day.routes, "route") : "",
  ].filter(Boolean);
  return `A typical day out: ${parts.join(" and ") || "no sends"}, across ${plural(day.days, "day")}`;
}

function candidates(m: PersonaMetrics): Candidate[] {
  const day = m.typicalDay;
  const list: Candidate[] = [
    {
      // Always eligible, so every climber who reaches the chapter has one; a
      // small typical day scores low and loses to anything else that fits.
      id: "volume-fiend",
      raw: day ? cap(dayScore(day.boulders, day.routes)) : 0,
      why: day ? typicalDayWhy(day) : `${plural(m.sends, "send")} this year`,
    },
  ];
  if (m.sends >= 20) {
    list.push({
      id: "flash-machine",
      raw: cap(m.firstTryRate / 0.75),
      why: `${percent(m.firstTryRate)} of ${plural(m.sends, "send")} went first try`,
    });
  }
  if (m.siege && m.siege.sessions >= 2) {
    list.push({
      id: "siege-mentality",
      raw: Math.sqrt(cap(m.siege.sessions / 5) * cap(30 / Math.max(m.sends, 1))),
      why: `${plural(m.siege.sessions, "session")} on ${m.siege.climbName}`,
    });
  }
  if (m.locatedDays >= 6) {
    const reach = cap(Math.max(m.tripLocations / 3, m.newClimbs / 100));
    list.push({
      id: "wanderer",
      raw: Math.sqrt(cap((1 - m.homeShare) / 0.6) * reach),
      why: `${plural(m.tripLocations, "trip destination")}, ${plural(m.newClimbs, "new climb")}, and no place had more than ${percent(m.homeShare)} of the days`,
    });
  }
  if (m.pyramid) {
    const p = m.pyramid;
    list.push({
      id: "pyramid-builder",
      raw: geometricMean([cap(p.tiers / 4), cap(p.base / Math.max(p.top, 1) / 3), p.shape]),
      why: `Pyramid from ${p.from} to ${p.to}: ${p.counts.join(", ")}`,
    });
  }
  if (m.repeats >= 10) {
    const share = m.repeats / (m.repeats + m.sends);
    list.push({
      id: "circuit-repeater",
      raw: cap(share / 0.3),
      why: `${plural(m.repeats, "repeat")}, dialling in a favourite circuit`,
    });
  }
  if (m.bestWindow && m.sends >= 25) {
    list.push({
      id: "seasonal-sprinter",
      raw: cap(m.bestWindow.share / 0.65),
      why: `${percent(m.bestWindow.share)} of sends happened between ${m.bestWindow.from} and ${m.bestWindow.to}`,
    });
  }
  // All three disciplines, as close to a third each as possible.
  const shares = m.disciplineShares.map(({ share }) => share);
  const allThree = shares.length === Object.keys(DISCIPLINE_NAMES).length;
  if (m.sends >= 30 && allThree && Math.min(...shares) >= 0.15) {
    const spread = Math.max(...shares) - Math.min(...shares);
    list.push({
      id: "all-rounder",
      raw: cap((ALL_ROUNDER_ZERO_SPREAD - spread) / ALL_ROUNDER_SPREAD_STEP),
      why: `${m.disciplineShares
        .map(({ type, share }) => `${percent(share)} ${DISCIPLINE_NAMES[type]}`)
        .join(", ")} across ${plural(m.sends, "send")}`,
    });
  }
  return list;
}

/** The climber's three strongest personas, strongest first. */
export function rankPersonas(metrics: PersonaMetrics, limit = 3): PersonaResult[] {
  return candidates(metrics)
    .map((candidate) => ({ ...candidate, score: percentile(candidate.id, candidate.raw) }))
    .toSorted((a, b) => b.score - a.score || PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id))
    .slice(0, limit)
    .map(({ id, why, score }) => ({ id, name: PERSONA_NAMES[id], why, score }));
}
