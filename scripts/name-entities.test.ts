import { describe, expect, it } from "vitest";

import { hasUnhandledEntity, repairName } from "./name-entities.ts";

describe("repairName", () => {
  it("repairs the bare &amp found in production names", () => {
    expect(repairName("Jekyll &amp Hyde")).toBe("Jekyll & Hyde");
    expect(repairName("Huey Lewis &amp The News")).toBe("Huey Lewis & The News");
    expect(repairName("60's &amp 70's")).toBe("60's & 70's");
    expect(repairName("5.10 Until Lee &amp Jeff Do It")).toBe("5.10 Until Lee & Jeff Do It");
    expect(repairName("Covid &amp The Vaccine Boulders")).toBe("Covid & The Vaccine Boulders");
  });

  it("repairs the properly-terminated entity too", () => {
    expect(repairName("Salt &amp; Pepper")).toBe("Salt & Pepper");
  });

  it("unwraps a name encoded twice", () => {
    expect(repairName("Salt &amp;amp; Pepper")).toBe("Salt & Pepper");
  });

  it("stops unwrapping rather than eating an escaped entity forever", () => {
    expect(repairName("&amp;amp;amp;amp;amp;")).toBe("&amp;amp;");
  });

  it("leaves a real ampersand and words that merely start with amp alone", () => {
    expect(repairName("Cams #3 & #4")).toBe("Cams #3 & #4");
    expect(repairName("Salt & Pepper")).toBe("Salt & Pepper");
    expect(repairName("R&D")).toBe("R&D");
    expect(repairName("&ampersand")).toBe("&ampersand");
    expect(repairName("Amphitheatre")).toBe("Amphitheatre");
    expect(repairName("Vamp")).toBe("Vamp");
    // A digit or underscore continues a token just as a letter does.
    expect(repairName("&amp3 Cracks")).toBe("&amp3 Cracks");
    expect(repairName("&amp_thing")).toBe("&amp_thing");
  });

  it("repairs &amp at the very end of a name", () => {
    expect(repairName("Fish &amp")).toBe("Fish &");
  });

  it("returns a name with no ampersand untouched", () => {
    expect(repairName("Titanic")).toBe("Titanic");
    expect(repairName("")).toBe("");
  });
});

describe("hasUnhandledEntity", () => {
  it("flags an entity shape this rule does not claim", () => {
    expect(hasUnhandledEntity("Caf&eacute; Wall")).toBe(true);
    expect(hasUnhandledEntity("I&rsquo;ve")).toBe(true);
    expect(hasUnhandledEntity("It&#39;s")).toBe(true);
    expect(hasUnhandledEntity("It&#x27;s")).toBe(true);
  });

  // The corruption in names drops the semicolon, so a detector that required
  // one would be blind to the very shape this script exists for.
  it("flags an unterminated entity, the shape the names are actually corrupted with", () => {
    expect(hasUnhandledEntity("Caf&eacute Wall")).toBe(true);
    expect(hasUnhandledEntity("Jekyll &rsquo Hyde")).toBe(true);
    expect(hasUnhandledEntity("It&#39s")).toBe(true);
  });

  it("flags a name the repair only partly cleans", () => {
    expect(hasUnhandledEntity("Salt &amp Caf&eacute Wall")).toBe(true);
  });

  it("does not flag a name the repair fully cleans", () => {
    expect(hasUnhandledEntity("Jekyll &amp Hyde")).toBe(false);
    expect(hasUnhandledEntity("Salt &amp; Pepper")).toBe(false);
    expect(hasUnhandledEntity("Cams #3 & #4")).toBe(false);
    expect(hasUnhandledEntity("Titanic")).toBe(false);
  });

  it("does not flag a one-letter initialism around an ampersand", () => {
    expect(hasUnhandledEntity("R&D")).toBe(false);
    expect(hasUnhandledEntity("AT&T")).toBe(false);
    expect(hasUnhandledEntity("Salt & Pepper")).toBe(false);
  });
});
