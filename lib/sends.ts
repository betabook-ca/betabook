import { z } from "zod";

import { ActionError } from "@/lib/action-result";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import { MAX_LOG_NOTE_LENGTH } from "@/lib/log-note";
import { parseGradeIndex, trimOrNull } from "@/lib/validation";

export { MAX_LOG_NOTE_LENGTH as MAX_COMMENT_LENGTH } from "@/lib/log-note";

export const ASCENT_STYLES = ["redpoint", "flash", "onsight"] as const;
export type AscentStyle = (typeof ASCENT_STYLES)[number];

const BOULDER_ASCENT_STYLES = ["redpoint", "flash"] as const;

/** Bouldering has no onsight/flash distinction, so a boulder sent first try is
 * a flash. Onsight stays a rope-only style; migration 0042's triggers enforce
 * the same rule in D1. */
export function ascentStylesFor(climbType: ClimbType): readonly AscentStyle[] {
  return climbType === "boulder" ? BOULDER_ASCENT_STYLES : ASCENT_STYLES;
}

const BOULDER_ONSIGHT_ERROR = "Boulders can't be onsighted — log it as a flash";

export const IMPORT_BATCH_SIZE = 50;

// Bounds lookup work and response size; names use a single JSON binding.
export const RESOLVE_BATCH_SIZE = 100;

export const GRADE_FEEL_VALUES = ["low", "solid", "high"] as const;
export type GradeFeel = (typeof GRADE_FEEL_VALUES)[number];

// Grade feel shifts a suggested grade by 0.3 for community averages.
export const GRADE_FEEL_OFFSET: Record<GradeFeel, number> = {
  low: -0.3,
  solid: 0,
  high: 0.3,
};

export type SendInput = {
  ascentStyle: AscentStyle;
  dateSent: string | null;
  comment: string | null;
  rating: number | null;
  suggestedGrade: number;
  gradeFeel: GradeFeel;
};

export type RawSendInput = {
  ascentStyle: FormDataEntryValue | null;
  dateSent: FormDataEntryValue | null;
  comment: FormDataEntryValue | null;
  rating: FormDataEntryValue | null;
  suggestedGrade: FormDataEntryValue | null;
  gradeFeel: FormDataEntryValue | null;
};

/** The `YYYY-MM-DD` shape alone. Enough for a key that only has to match
 * stored dates; user-entered dates go through `isRealIsoDate`. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Allow one day past UTC today because the client's calendar date may be ahead. */
export function latestAcceptableSendDate(todayUtc: string): string {
  const [year, month, day] = todayUtc.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function parseAscentStyle(value: unknown, climbType: ClimbType): AscentStyle {
  if (typeof value !== "string" || !(ASCENT_STYLES as readonly string[]).includes(value)) {
    throw new ActionError("Invalid ascent style");
  }
  if (!(ascentStylesFor(climbType) as readonly string[]).includes(value)) {
    throw new ActionError(BOULDER_ONSIGHT_ERROR);
  }
  return value as AscentStyle;
}

/** Imports keep the row rather than failing it: a boulder "onsight" from
 * another app is what Betabook records as a flash. */
function coerceImportAscentStyle(value: unknown, climbType: ClimbType): AscentStyle {
  if (typeof value !== "string" || !(ASCENT_STYLES as readonly string[]).includes(value)) {
    throw new ActionError("Invalid ascent style");
  }
  const style = value as AscentStyle;
  return ascentStylesFor(climbType).includes(style) ? style : "flash";
}

/** Validate the calendar date as well as its ISO shape, rejecting values such as 2026-02-30. */
export function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const isoDateSchema = z.string().refine(isRealIsoDate, "Choose a valid date.");

function parseDateSent(value: unknown, today: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ActionError("Invalid send date");
  }
  const dateSent = value.trim();
  if (!dateSent) return null;
  if (!isRealIsoDate(dateSent)) {
    throw new ActionError("Invalid send date");
  }
  if (dateSent > latestAcceptableSendDate(today)) {
    throw new ActionError("Send date can't be in the future");
  }
  return dateSent;
}

/** Ratings feed shared climb aggregates, so enforce whole values from 1 to 5. */
function isRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function parseGradeFeel(value: unknown): GradeFeel {
  return typeof value === "string" && (GRADE_FEEL_VALUES as readonly string[]).includes(value)
    ? (value as GradeFeel)
    : "solid";
}

export function validateSendInput(
  climbType: ClimbType,
  raw: RawSendInput,
  today: string = new Date().toISOString().slice(0, 10),
): SendInput {
  const ascentStyle = parseAscentStyle(raw.ascentStyle, climbType);
  const dateSent = parseDateSent(raw.dateSent, today);

  const comment = trimOrNull(raw.comment);
  if (comment && comment.length > MAX_LOG_NOTE_LENGTH) {
    throw new ActionError(`Comment must be ${MAX_LOG_NOTE_LENGTH} characters or fewer`);
  }

  const rating = raw.rating ? Number(raw.rating) : null;
  if (rating !== null && !isRating(rating)) {
    throw new ActionError("Rating must be between 1 and 5");
  }

  const suggestedGrade = parseGradeIndex(
    raw.suggestedGrade,
    nativeGradeArray(climbType).length,
    "Suggested grade",
  );

  return {
    ascentStyle,
    dateSent,
    comment,
    rating,
    suggestedGrade,
    gradeFeel: parseGradeFeel(raw.gradeFeel),
  };
}

export type ImportSendValues = {
  ascentStyle: AscentStyle;
  dateSent: string | null;
  comment: string | null;
  rating: number | null;
  gradeFeel: GradeFeel;
};

/** Keep grades as text until the server resolves the climb's current discipline. */
export type ImportSendRow = ImportSendValues & {
  climbId: number;
  gradeText: string | null;
  /** What a null gradeText means — see NormalizedImportRow.blankGradeMeans. */
  blankGradeMeans: "posted-grade" | "no-suggestion";
};

/** Apply the same coercions and validation as CSV normalization at the server boundary. */
export function validateImportSendValues(
  row: {
    ascentStyle: unknown;
    dateSent: unknown;
    comment: unknown;
    rating: unknown;
    gradeFeel: unknown;
  },
  climbType: ClimbType,
  today: string = new Date().toISOString().slice(0, 10),
): ImportSendValues {
  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  return {
    ascentStyle: coerceImportAscentStyle(row.ascentStyle, climbType),
    dateSent: parseDateSent(row.dateSent, today),
    comment: comment ? comment.slice(0, MAX_LOG_NOTE_LENGTH) : null,
    rating: isRating(row.rating) ? row.rating : null,
    gradeFeel: parseGradeFeel(row.gradeFeel),
  };
}

export type ImportResult = {
  imported: number;
  overwritten: number;
  alreadyLogged: number;
  /** Indices within this batch whose climb no longer exists. */
  missing: number[];
  /** Indices within this batch refused because the climb broke before the
   * row's date (or the row is undated). Absent on receipts stored before
   * broken climbs existed, so readers default it to []. */
  broken?: number[];
};

export type ImportOptions = {
  batchId?: string;
  gradeScale: "native" | "converted";
  onConflict: "skip" | "overwrite";
};
