import { describe, expect, it } from "vitest";

import { areaHref, climbHref, slugify, withQuery } from "./slug";

describe("slugify", () => {
  it("lowercases, hyphenates words, and trims", () => {
    expect(slugify("Midnight Lightning")).toBe("midnight-lightning");
    expect(slugify("  The  Nose  ")).toBe("the-nose");
  });

  it("drops apostrophes so the word stays whole", () => {
    expect(slugify("Don't Get Greedy")).toBe("dont-get-greedy");
    expect(slugify("O’Kelley’s Arete")).toBe("okelleys-arete");
  });

  it("flattens accents to ASCII", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
    expect(slugify("Böhmischer Traum")).toBe("bohmischer-traum");
  });

  it("transliterates European ligatures and stroke letters", () => {
    expect(slugify("Großglockner")).toBe("grossglockner");
    expect(slugify("Blåbæret")).toBe("blabaeret");
    expect(slugify("Sørlandet")).toBe("sorlandet");
    expect(slugify("Łódź")).toBe("lodz");
    expect(slugify("L’Œil")).toBe("loeil");
  });

  it("collapses punctuation and symbols to single hyphens", () => {
    expect(slugify("5.12a / V8 — project!")).toBe("5-12a-v8-project");
  });

  it("returns empty when nothing slug-able survives", () => {
    expect(slugify("上高地")).toBe("");
    expect(slugify("!!!")).toBe("");
  });

  it("caps length and never leaves a trailing hyphen", () => {
    const cut = slugify("a".repeat(79) + " tail");
    expect(cut).toBe("a".repeat(79));
    expect(cut.length).toBeLessThanOrEqual(80);
  });
});

describe("climbHref / areaHref", () => {
  it("builds id + slug paths", () => {
    expect(climbHref(141187, "Midnight Lightning")).toBe("/climbs/141187/midnight-lightning");
    expect(areaHref(3611, "Squamish")).toBe("/areas/3611/squamish");
  });

  it("omits the slug segment when the name yields nothing", () => {
    expect(climbHref(42, "上")).toBe("/climbs/42");
    expect(areaHref(7, "???")).toBe("/areas/7");
  });
});

describe("withQuery", () => {
  it("returns the path unchanged when there are no params", () => {
    expect(withQuery("/areas/3/squamish", {})).toBe("/areas/3/squamish");
    expect(withQuery("/areas/3/squamish", { a: undefined })).toBe("/areas/3/squamish");
  });

  it("appends scalar and repeated params, encoding values", () => {
    expect(withQuery("/areas/3/squamish", { mode: "climb", sort: "grade_desc" })).toBe(
      "/areas/3/squamish?mode=climb&sort=grade_desc",
    );
    expect(withQuery("/areas/3", { discipline: ["boulder", "sport"] })).toBe(
      "/areas/3?discipline=boulder&discipline=sport",
    );
    expect(withQuery("/areas/3", { name: "Château d'Ax" })).toBe(
      "/areas/3?name=Ch%C3%A2teau+d%27Ax",
    );
  });
});
