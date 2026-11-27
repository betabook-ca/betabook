import { formatGrade, type ClimbType } from "@/lib/grades";
/** Reporter's explanation of the break; kept short because it is appended
 * verbatim to the climb's description. */
export const MAX_BREAK_REASON_LENGTH = 500;

export type ClimbBreakInput = { brokenOn: string; reason: string };

/** The strings written when a break is approved. They are composed once,
 * when the report is submitted, and stored in the change request payload so
 * the moderator approves exactly the text that lands: nothing is recomputed
 * at apply time, and a later rename leaves them untouched. */
export type ClimbBreakTexts = {
  successorName: string;
  appendedDescription: string;
  successorDescription: string;
};

type BreakSubject = {
  name: string;
  type: ClimbType;
  grade: number | null;
  description: string | null;
};

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function successorClimbName(name: string, brokenOn: string): string {
  return `${name} - post break (${brokenOn.slice(0, 4)})`;
}

export function composeClimbBreakTexts(
  climb: BreakSubject,
  input: ClimbBreakInput,
): ClimbBreakTexts {
  const successorName = successorClimbName(climb.name, input.brokenOn);
  const breakNotice =
    `This climb broke on ${input.brokenOn}. ${sentence(input.reason)} ` +
    `Ascents from before that date can still be logged. ` +
    `The post-break version is listed as ${successorName}.`;
  const appendedDescription = climb.description
    ? `${climb.description}\n\n${breakNotice}`
    : breakNotice;
  const gradeSentence = ` Its ${formatGrade(climb.type, climb.grade)} grade is carried over from the original as a placeholder until it sees more ascents.`;
  const successorDescription = `Post-break version of ${climb.name}, which broke on ${input.brokenOn}.${gradeSentence}`;
  return { successorName, appendedDescription, successorDescription };
}

/** A broken climb accepts only ascents dated strictly before the break.
 * Undated rows cannot be shown to predate it, so they are refused too. The
 * database triggers from migration 0044 enforce the same rule. */
export function isLoggableOnClimb(
  climb: { brokenOn: string | null },
  date: string | null,
): boolean {
  if (climb.brokenOn === null) return true;
  return date !== null && date < climb.brokenOn;
}

/** Latest date the pickers may offer for a climb: the day before the break,
 * or `today` when the climb is intact or broke later than today. */
export function latestLoggableDate(climb: { brokenOn: string | null }, today: string): string {
  if (climb.brokenOn === null || climb.brokenOn > today) return today;
  const [year, month, day] = climb.brokenOn.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}
