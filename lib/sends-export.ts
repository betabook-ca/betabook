import Papa from "papaparse";

import type { UserSendRow } from "@/db/queries";
import { formatGrade } from "@/lib/grades";

const EXPORT_FIELDS = [
  "Date Sent",
  "Ascent Style",
  "Climb Name",
  "Area Name",
  "Climb Type",
  "Grade",
  "Suggested Grade",
  "Grade Feel",
  "Rating",
  "Comment",
  "Videos",
];

/** Which cells a spreadsheet would read as a formula, so papaparse prefixes
 * them with an apostrophe.
 *
 * Passed instead of `escapeFormulae: true`, whose built-in pattern is
 * `/^[=+\-@\t\r].*$/` — and `.` does not match a newline, so a single LF
 * anywhere in the cell makes the whole pattern fail and the payload ships
 * unescaped. `=HYPERLINK(...)\n` is enough, and climb and area names keep
 * interior newlines (requireTrimmed only trims the ends). Anchoring on the
 * first character alone has no such hole. */
const CSV_FORMULA_START = /^[=+\-@\t\r\n]/;

export const CSV_UNPARSE_CONFIG = { escapeFormulae: CSV_FORMULA_START } as const;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildSendsExportCsv(rows: UserSendRow[]): string {
  const data = rows.map((row) => [
    row.dateSent ?? "",
    capitalize(row.ascentStyle),
    row.climbName,
    row.areaName,
    capitalize(row.climbType),
    formatGrade(row.climbType, row.climbGrade),
    row.suggestedGrade != null ? formatGrade(row.climbType, row.suggestedGrade) : "",
    capitalize(row.gradeFeel),
    row.rating ?? "",
    row.comment ?? "",
    // Space-separated: canonical links never contain one.
    (row.videos ?? []).join(" "),
  ]);
  return Papa.unparse({ fields: EXPORT_FIELDS, data }, CSV_UNPARSE_CONFIG);
}
