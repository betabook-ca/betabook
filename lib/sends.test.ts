import { describe, expect, it } from "vitest";

import {
  MAX_COMMENT_LENGTH,
  validateImportSendValues,
  validateSendInput,
  type RawSendInput,
} from "./sends";

const TODAY = "2026-08-19";

function raw(overrides: Partial<RawSendInput> = {}): RawSendInput {
  return {
    ascentStyle: "redpoint",
    dateSent: TODAY,
    comment: null,
    rating: null,
    suggestedGrade: "5",
    gradeFeel: "solid",
    ...overrides,
  };
}

describe("validateSendInput", () => {
  it("accepts a minimal valid input for a boulder climb", () => {
    const result = validateSendInput("boulder", raw(), TODAY);
    expect(result).toEqual({
      ascentStyle: "redpoint",
      dateSent: TODAY,
      comment: null,
      rating: null,
      suggestedGrade: 5,
      gradeFeel: "solid",
    });
  });

  it.each(["sport", "trad"] as const)("accepts each ascent style on a %s climb", (climbType) => {
    for (const ascentStyle of ["redpoint", "flash", "onsight"]) {
      expect(validateSendInput(climbType, raw({ ascentStyle }), TODAY).ascentStyle).toBe(
        ascentStyle,
      );
    }
  });

  it("rejects an onsight on a boulder and accepts its other styles", () => {
    expect(() => validateSendInput("boulder", raw({ ascentStyle: "onsight" }), TODAY)).toThrow(
      "Boulders can't be onsighted",
    );
    for (const ascentStyle of ["redpoint", "flash"]) {
      expect(validateSendInput("boulder", raw({ ascentStyle }), TODAY).ascentStyle).toBe(
        ascentStyle,
      );
    }
  });

  it("rejects an invalid ascent style", () => {
    expect(() => validateSendInput("boulder", raw({ ascentStyle: "attempt" }), TODAY)).toThrow(
      "Invalid ascent style",
    );
  });

  it("rejects a malformed send date", () => {
    expect(() => validateSendInput("boulder", raw({ dateSent: "08/19/2026" }), TODAY)).toThrow(
      "Invalid send date",
    );
  });

  it("rejects a send date two days past UTC today", () => {
    expect(() => validateSendInput("boulder", raw({ dateSent: "2026-08-21" }), TODAY)).toThrow(
      "can't be in the future",
    );
  });

  it("accepts a send date equal to today", () => {
    expect(validateSendInput("boulder", raw({ dateSent: TODAY }), TODAY).dateSent).toBe(TODAY);
  });

  it("accepts a send date one day past UTC today (a UTC+14 client's local today)", () => {
    expect(validateSendInput("boulder", raw({ dateSent: "2026-08-20" }), TODAY).dateSent).toBe(
      "2026-08-20",
    );
  });

  it("applies the one-day tolerance across a month boundary", () => {
    expect(
      validateSendInput("boulder", raw({ dateSent: "2026-09-01" }), "2026-08-31").dateSent,
    ).toBe("2026-09-01");
    expect(() =>
      validateSendInput("boulder", raw({ dateSent: "2026-09-02" }), "2026-08-31"),
    ).toThrow("can't be in the future");
  });

  it("accepts a null send date", () => {
    expect(validateSendInput("boulder", raw({ dateSent: null }), TODAY).dateSent).toBeNull();
  });

  it("treats a blank send date as null", () => {
    expect(validateSendInput("boulder", raw({ dateSent: "" }), TODAY).dateSent).toBeNull();
    expect(validateSendInput("boulder", raw({ dateSent: "   " }), TODAY).dateSent).toBeNull();
  });

  it("trims a comment and accepts it under the length limit", () => {
    const result = validateSendInput("boulder", raw({ comment: "  Great climb!  " }), TODAY);
    expect(result.comment).toBe("Great climb!");
  });

  it("treats a blank comment as null", () => {
    expect(validateSendInput("boulder", raw({ comment: "   " }), TODAY).comment).toBeNull();
  });

  it("accepts a 2,000-character comment without truncating it", () => {
    const comment = "a".repeat(2000);
    expect(validateSendInput("boulder", raw({ comment }), TODAY).comment).toBe(comment);
  });

  it("rejects a comment over 2,000 characters", () => {
    expect(() => validateSendInput("boulder", raw({ comment: "a".repeat(2001) }), TODAY)).toThrow(
      "2000 characters or fewer",
    );
  });

  it("accepts a null rating (abstain)", () => {
    expect(validateSendInput("boulder", raw({ rating: null }), TODAY).rating).toBeNull();
  });

  it("accepts ratings 1 through 5", () => {
    for (let rating = 1; rating <= 5; rating += 1) {
      expect(validateSendInput("boulder", raw({ rating: String(rating) }), TODAY).rating).toBe(
        rating,
      );
    }
  });

  it("rejects an out-of-range rating", () => {
    expect(() => validateSendInput("boulder", raw({ rating: "0" }), TODAY)).toThrow(
      "Rating must be between 1 and 5",
    );
    expect(() => validateSendInput("boulder", raw({ rating: "6" }), TODAY)).toThrow(
      "Rating must be between 1 and 5",
    );
  });

  it("rejects a non-integer rating", () => {
    expect(() => validateSendInput("boulder", raw({ rating: "3.5" }), TODAY)).toThrow(
      "Rating must be between 1 and 5",
    );
  });

  it("rejects a missing suggested grade", () => {
    expect(() => validateSendInput("boulder", raw({ suggestedGrade: null }), TODAY)).toThrow(
      "Suggested grade is required",
    );
    expect(() => validateSendInput("boulder", raw({ suggestedGrade: "" }), TODAY)).toThrow(
      "Suggested grade is required",
    );
  });

  it("accepts a suggested grade within the climb type's native scale", () => {
    expect(validateSendInput("boulder", raw({ suggestedGrade: "5" }), TODAY).suggestedGrade).toBe(
      5,
    );
    expect(validateSendInput("sport", raw({ suggestedGrade: "10" }), TODAY).suggestedGrade).toBe(
      10,
    );
  });

  it("rejects a suggested grade out of range for the climb type", () => {
    expect(() => validateSendInput("boulder", raw({ suggestedGrade: "999" }), TODAY)).toThrow(
      "Invalid suggested grade",
    );
    expect(() => validateSendInput("boulder", raw({ suggestedGrade: "-1" }), TODAY)).toThrow(
      "Invalid suggested grade",
    );
  });

  it("rejects a non-integer suggested grade", () => {
    expect(() => validateSendInput("boulder", raw({ suggestedGrade: "2.5" }), TODAY)).toThrow(
      "Invalid suggested grade",
    );
  });

  it("accepts each grade feel value", () => {
    for (const gradeFeel of ["low", "solid", "high"]) {
      expect(validateSendInput("boulder", raw({ gradeFeel }), TODAY).gradeFeel).toBe(gradeFeel);
    }
  });

  it("defaults grade feel to solid when missing", () => {
    expect(validateSendInput("boulder", raw({ gradeFeel: null }), TODAY).gradeFeel).toBe("solid");
  });

  it("defaults grade feel to solid for an unrecognized value, without throwing", () => {
    expect(validateSendInput("boulder", raw({ gradeFeel: "medium" }), TODAY).gradeFeel).toBe(
      "solid",
    );
  });
});

// importSends is a server action, so its `rows` argument reaches the server
// over HTTP with its NormalizedImportRow type erased. These cover what a
// caller who skipped the wizard can put in one.
describe("validateImportSendValues", () => {
  const importRow = (overrides: Record<string, unknown> = {}) => ({
    ascentStyle: "redpoint",
    dateSent: TODAY,
    comment: null,
    rating: 4,
    gradeFeel: "solid",
    ...overrides,
  });

  it("passes a wizard-normalized row through unchanged", () => {
    expect(validateImportSendValues(importRow(), "sport", TODAY)).toEqual({
      ascentStyle: "redpoint",
      dateSent: TODAY,
      comment: null,
      rating: 4,
      gradeFeel: "solid",
    });
  });

  // The aggregate triggers sum rating into climbs.rating_sum and
  // climbs.avg_rating is generated from it, so an unchecked rating here moves
  // a shared climb's public average for everyone.
  it.each([0, 6, 1000000000, 2.5, -3, "4", null, undefined, Number.NaN])(
    "coerces the out-of-range rating %s to null",
    (rating) => {
      expect(validateImportSendValues(importRow({ rating }), "sport", TODAY).rating).toBeNull();
    },
  );

  it("keeps every in-range rating", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(validateImportSendValues(importRow({ rating }), "sport", TODAY).rating).toBe(rating);
    }
  });

  it("truncates an over-long comment rather than storing it", () => {
    const comment = "x".repeat(MAX_COMMENT_LENGTH + 5000);
    expect(validateImportSendValues(importRow({ comment }), "sport", TODAY).comment).toHaveLength(
      MAX_COMMENT_LENGTH,
    );
  });

  it("reads a blank or non-string comment as absent", () => {
    expect(
      validateImportSendValues(importRow({ comment: "   " }), "sport", TODAY).comment,
    ).toBeNull();
    expect(validateImportSendValues(importRow({ comment: 42 }), "sport", TODAY).comment).toBeNull();
  });

  it("defaults an unrecognized grade feel to solid", () => {
    expect(
      validateImportSendValues(importRow({ gradeFeel: "pwned" }), "sport", TODAY).gradeFeel,
    ).toBe("solid");
  });

  it.each(["sandbagged", "", null, 7])("rejects the ascent style %s", (ascentStyle) => {
    expect(() => validateImportSendValues(importRow({ ascentStyle }), "sport", TODAY)).toThrow(
      "Invalid ascent style",
    );
  });

  it("saves a boulder onsight as a flash but keeps a rope onsight", () => {
    const row = importRow({ ascentStyle: "onsight" });
    expect(validateImportSendValues(row, "boulder", TODAY).ascentStyle).toBe("flash");
    expect(validateImportSendValues(row, "sport", TODAY).ascentStyle).toBe("onsight");
    expect(validateImportSendValues(row, "trad", TODAY).ascentStyle).toBe("onsight");
    expect(
      validateImportSendValues(importRow({ ascentStyle: "redpoint" }), "boulder", TODAY)
        .ascentStyle,
    ).toBe("redpoint");
  });

  it("rejects a malformed date", () => {
    expect(() =>
      validateImportSendValues(importRow({ dateSent: "08/19/2026" }), "sport", TODAY),
    ).toThrow("Invalid send date");
  });

  it("rejects a future date", () => {
    expect(() =>
      validateImportSendValues(importRow({ dateSent: "2099-01-01" }), "sport", TODAY),
    ).toThrow("Send date can't be in the future");
  });

  it("reads a blank date as absent", () => {
    expect(
      validateImportSendValues(importRow({ dateSent: null }), "sport", TODAY).dateSent,
    ).toBeNull();
  });

  // The wizard parses dates with date-fns, which rejects a day the month
  // doesn't have; an ISO-shape check alone would let these through.
  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2025-02-29"])(
    "rejects the impossible date %s",
    (dateSent) => {
      expect(() => validateImportSendValues(importRow({ dateSent }), "sport", TODAY)).toThrow(
        "Invalid send date",
      );
    },
  );

  it("accepts a real leap day", () => {
    expect(
      validateImportSendValues(importRow({ dateSent: "2024-02-29" }), "sport", TODAY).dateSent,
    ).toBe("2024-02-29");
  });

  it("rejects a non-string date rather than reading it as absent", () => {
    expect(() =>
      validateImportSendValues(importRow({ dateSent: 20260101 }), "sport", TODAY),
    ).toThrow("Invalid send date");
  });
});
