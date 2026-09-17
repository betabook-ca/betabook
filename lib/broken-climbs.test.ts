import { describe, expect, it } from "vitest";

import {
  assertLoggableOnClimb,
  composeClimbBreakTexts,
  isLoggableOnClimb,
  latestLoggableDate,
  successorClimbName,
  validateClimbBreakInput,
} from "@/lib/broken-climbs";

const TODAY = "2026-09-16";

describe("validateClimbBreakInput", () => {
  it("accepts a real past date and a trimmed reason", () => {
    expect(
      validateClimbBreakInput({ brokenOn: " 2026-03-05 ", reason: "  Key hold snapped  " }, TODAY),
    ).toEqual({ brokenOn: "2026-03-05", reason: "Key hold snapped" });
  });

  it.each([
    [{ brokenOn: null, reason: "x" }, "Date is required"],
    [{ brokenOn: "2026-02-30", reason: "x" }, "Invalid date"],
    [{ brokenOn: "05/03/2026", reason: "x" }, "Invalid date"],
    [{ brokenOn: "2026-09-18", reason: "x" }, "The break date can't be in the future"],
    [{ brokenOn: "2026-03-05", reason: "   " }, "Reason is required"],
    [{ brokenOn: "2026-03-05", reason: "r".repeat(501) }, "Reason must be 500 characters or fewer"],
  ])("rejects %j", (raw, message) => {
    expect(() => validateClimbBreakInput(raw, TODAY)).toThrow(message);
  });
});

describe("composeClimbBreakTexts", () => {
  const input = { brokenOn: "2026-03-05", reason: "The crux flake came off" };

  it("names the successor after the break year and appends the notice to an existing description", () => {
    const texts = composeClimbBreakTexts(
      {
        name: "Midnight Lightning",
        type: "boulder",
        grade: 9,
        description: "Classic Camp 4 line.",
      },
      input,
    );
    expect(texts.successorName).toBe("Midnight Lightning - post break (2026)");
    expect(texts.appendedDescription).toBe(
      "Classic Camp 4 line.\n\nThis climb broke on 2026-03-05. The crux flake came off. " +
        "Ascents from before that date can still be logged. " +
        "The post-break version is listed as Midnight Lightning - post break (2026).",
    );
    expect(texts.successorDescription).toBe(
      "Post-break version of Midnight Lightning, which broke on 2026-03-05. " +
        "Its V8 grade is carried over from the original as a placeholder until it sees more ascents.",
    );
  });

  it("starts the description from the notice when none exists, keeps reason punctuation, and skips the grade sentence for an ungraded climb", () => {
    const texts = composeClimbBreakTexts(
      { name: "Unnamed Arete", type: "sport", grade: null, description: null },
      { brokenOn: "2025-11-30", reason: "Rockfall!" },
    );
    expect(texts.successorName).toBe("Unnamed Arete - post break (2025)");
    expect(texts.appendedDescription).toBe(
      "This climb broke on 2025-11-30. Rockfall! Ascents from before that date can still be logged. " +
        "The post-break version is listed as Unnamed Arete - post break (2025).",
    );
    expect(texts.successorDescription).toBe(
      "Post-break version of Unnamed Arete, which broke on 2025-11-30.",
    );
  });

  it("exposes the name rule on its own", () => {
    expect(successorClimbName("Thriller", "2024-01-02")).toBe("Thriller - post break (2024)");
  });
});

describe("logging on a broken climb", () => {
  const broken = { brokenOn: "2026-03-05" };
  const intact = { brokenOn: null };

  it("allows any date, or no date, on an intact climb", () => {
    expect(isLoggableOnClimb(intact, null)).toBe(true);
    expect(isLoggableOnClimb(intact, "2030-01-01")).toBe(true);
  });

  it("allows only dates strictly before the break", () => {
    expect(isLoggableOnClimb(broken, "2026-03-04")).toBe(true);
    expect(isLoggableOnClimb(broken, "2026-03-05")).toBe(false);
    expect(isLoggableOnClimb(broken, "2026-03-06")).toBe(false);
    expect(isLoggableOnClimb(broken, null)).toBe(false);
  });

  it("throws the user-facing message", () => {
    expect(() => assertLoggableOnClimb(broken, null)).toThrow(
      "This climb broke on 2026-03-05. Only ascents dated before that can be logged.",
    );
    expect(() => assertLoggableOnClimb(broken, "2026-01-01")).not.toThrow();
  });

  it("caps the picker at the day before the break, crossing month boundaries", () => {
    expect(latestLoggableDate(intact, TODAY)).toBe(TODAY);
    expect(latestLoggableDate(broken, TODAY)).toBe("2026-03-04");
    expect(latestLoggableDate({ brokenOn: "2026-03-01" }, TODAY)).toBe("2026-02-28");
    expect(latestLoggableDate({ brokenOn: "2026-12-31" }, TODAY)).toBe(TODAY);
  });
});
