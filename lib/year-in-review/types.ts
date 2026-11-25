import type { ClimbType } from "@/lib/grades";
import type { AscentStyle } from "@/lib/sends";
import type { PyramidRow } from "@/lib/user-analytics";

/** One of the owner's sends, dated or not, over all time. `grade` is the
 * send's suggested grade, the one grade every analytics chart uses. */
export type YearSendRow = {
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  grade: number;
  areaId: number;
  ascentStyle: AscentStyle;
  dateSent: string | null;
  rating: number | null;
  comment: string | null;
  /** The climb's community rating aggregate, including this send's rating. */
  ratingSum: number;
  ratingCount: number;
};

export type YearCompanion = { id: string; name: string; image: string | null };

/** One of the owner's climb sessions (journal entries with a climb), over all
 * time. Training entries have no climb and are not loaded. */
export type YearSessionRow = {
  id: number;
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  /** The climb's listed grade, for climbs tried but not sent. */
  climbGrade: number;
  areaId: number;
  entryDate: string;
  sent: boolean;
  isAscent: boolean;
  companions: YearCompanion[];
};

export type YearTripRow = { id: number; name: string; startDate: string; endDate: string };

/** Every area the owner has activity in, and every ancestor of those, keyed by
 * id. `path` is root-first and ends with the area itself. */
export type YearAreaMap = ReadonlyMap<number, { name: string; path: readonly number[] }>;

export type YearReviewInput = {
  year: number;
  /** Civil date, for leaving out trips that haven't started. */
  today: string;
  sends: readonly YearSendRow[];
  sessions: readonly YearSessionRow[];
  trips: readonly YearTripRow[];
  areas: YearAreaMap;
};

/** A place, printed as its breadcrumb: the last few names of its path. */
export type YearPlace = { id: number; name: string; trail: string[] };

export type RankedSend = {
  rank: number;
  grade: number;
  label: string;
  climbId: number;
  climbName: string;
  place: YearPlace | null;
  dateSent: string;
  ascentStyle: AscentStyle;
};

export type DisciplineRanking = { type: ClimbType; rows: RankedSend[] };

export type YearChapterId =
  | "intro"
  | "days"
  | "calendar"
  | "biggest-day"
  | "home-turf"
  | "new-climbs"
  | "trips"
  | "new-grades"
  | "hardest"
  | "flashes"
  | "onsights"
  | "styles"
  | "pyramids"
  | "partner"
  | "got-away"
  | "not-worth-the-pump"
  | "personas";

type IntroChapter = {
  daysOut: number;
  sends: number;
  /** Distinct areas holding a climb logged this year (each climb's own area). */
  areasVisited: number;
  disciplines: ClimbType[];
};

type DaysChapter = {
  daysOut: number;
  /** Days out per month, January first. */
  byMonth: number[];
};

export type CalendarChapter = {
  peakMonth: { month: number; days: number; sends: number };
  daysByMonth: number[];
  hardestMonths: {
    type: ClimbType;
    month: number;
    label: string;
    climbName: string;
  }[];
  weekday: {
    /** Weekdays (0 = Sunday) tied for the best score. */
    best: number[];
    /** Mean best-of-day relative grade, 0–100, or null where too few days. */
    scores: (number | null)[];
    sendDays: number[];
    /** The best Tuesday send typically sits in the top N% of the year. */
    topPercent: number;
    /** Average best-of-day grade per weekday, for a single-discipline year. */
    grades: (string | null)[] | null;
  } | null;
};

export type DayHighlight = {
  date: string;
  climbs: number;
  sends: number;
  place: YearPlace | null;
  /** Several roots: the day's climbs share no area. */
  roots: string[];
  hardest: { climbName: string; label: string } | null;
  list: { climbId: number; climbName: string; label: string; sent: boolean }[];
};

export type BiggestDayChapter = {
  biggestDay: DayHighlight | null;
  rampage: DayHighlight | null;
  sameDay: boolean;
};

export type HomeTurfChapter = {
  place: YearPlace;
  days: number;
  totalDays: number;
  sends: number;
  spread: boolean;
  breakdown: { name: string; days: number }[];
};

export type NewClimbsChapter = {
  newClimbs: number;
  tried: number;
  firstVisits: { place: YearPlace; date: string }[];
};

export type TripCard = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  climbingDays: number;
  sends: number;
  location: YearPlace | null;
  roots: string[];
  hardest: { type: ClimbType; label: string }[];
  newGrades: number;
};

export type TripsChapter = {
  trips: TripCard[];
  totalDays: number;
  shareOfDays: number;
  biggest: TripCard | null;
  returnTrip: { trip: TripCard; visit: number; firstYear: number } | null;
  repeatedPlaces: { name: string; count: number }[];
};

export type GradeStep = {
  date: string;
  label: string;
  climbId: number;
  climbName: string;
  place: YearPlace | null;
  waitDays: number | null;
};

export type NewGradesChapter = {
  disciplines: {
    type: ClimbType;
    steps: GradeStep[];
    firstYear: { from: string; to: string } | null;
  }[];
};

export type StylesChapter = {
  disciplines: {
    type: ClimbType;
    onsight: number;
    flash: number;
    redpoint: number;
    repeat: number;
    firstTryRate: number;
  }[];
};

type PyramidsChapter = {
  disciplines: {
    type: ClimbType;
    rows: PyramidRow[];
    /** Grade labels holding a top-3 send. */
    marked: string[];
  }[];
};

export type PartnerChapter = { partner: YearCompanion; days: number };

type GotAwayClimb = {
  climbId: number;
  climbName: string;
  label: string;
  sessions: number;
  first: string;
  last: string;
};

/** Up to three climbs tried twice or more in the year and never sent, most
 * sessions first. */
export type GotAwayChapter = { climbs: GotAwayClimb[] };

export type NotWorthThePumpChapter = {
  climbs: {
    climbId: number;
    climbName: string;
    label: string;
    rating: number;
    comment: string | null;
    othersAverage: number | null;
    place: YearPlace | null;
  }[];
};

export type PersonaId =
  | "volume-fiend"
  | "flash-machine"
  | "siege-mentality"
  | "wanderer"
  | "pyramid-builder"
  | "circuit-repeater"
  | "seasonal-sprinter"
  | "all-rounder";

export type PersonaResult = { id: PersonaId; name: string; why: string; score: number };

type PersonasChapter = { personas: PersonaResult[] };

export type YearChapters = {
  intro: IntroChapter;
  days: DaysChapter;
  hardest: { disciplines: DisciplineRanking[]; undated: number };
  pyramids: PyramidsChapter & { undated: number };
  calendar: CalendarChapter | null;
  biggestDay: BiggestDayChapter | null;
  homeTurf: HomeTurfChapter | null;
  newClimbs: NewClimbsChapter | null;
  trips: TripsChapter | null;
  newGrades: NewGradesChapter | null;
  flashes: { disciplines: DisciplineRanking[] } | null;
  onsights: { disciplines: DisciplineRanking[] } | null;
  styles: StylesChapter | null;
  partner: PartnerChapter | null;
  gotAway: GotAwayChapter | null;
  notWorthThePump: NotWorthThePumpChapter | null;
  personas: PersonasChapter | null;
};

/** A hidden chapter and how to earn it next year. `positive` marks a line
 * that celebrates rather than nudges ("Nothing got away"). */
export type MissedChapter = { id: YearChapterId; hint: string; positive?: boolean };

export type YearReview = {
  year: number;
  /** 1+ day out or 1+ dated send. */
  active: boolean;
  chapters: YearChapters;
  missed: MissedChapter[];
};
