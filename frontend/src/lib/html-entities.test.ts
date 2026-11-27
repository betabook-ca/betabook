import { describe, expect, it } from "vitest";

import { decodeHtmlEntities } from "./html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes the curly quotes a Sendage export leaves in a comment", () => {
    expect(decodeHtmlEntities("One of the best climbs I&rsquo;ve ever done")).toBe(
      "One of the best climbs I’ve ever done",
    );
    expect(
      decodeHtmlEntities("called the &lsquo;depth charge&rsquo; boulder as opposed to titanic"),
    ).toBe("called the ‘depth charge’ boulder as opposed to titanic");
  });

  it("decodes the core five", () => {
    expect(decodeHtmlEntities("&lt;b&gt; &amp; &quot;quoted&quot; &apos;quoted&apos;")).toBe(
      "<b> & \"quoted\" 'quoted'",
    );
  });

  it("decodes accented Latin-1 letters", () => {
    expect(decodeHtmlEntities("Caf&eacute; Cr&egrave;me")).toBe("Café Crème");
    expect(decodeHtmlEntities("&Agrave;&yuml;&szlig;&Ntilde;&divide;&deg;")).toBe("ÀÿßÑ÷°");
    // By code point: a literal non-breaking space reads as a plain one here.
    expect(decodeHtmlEntities("&nbsp;").codePointAt(0)).toBe(0xa0);
  });

  it("decodes typographic punctuation", () => {
    expect(decodeHtmlEntities("crimp &ndash; sloper &mdash; jug&hellip;")).toBe(
      "crimp – sloper — jug…",
    );
    expect(decodeHtmlEntities("&ldquo;the crux&rdquo;")).toBe("“the crux”");
  });

  it("decodes the wider sets a hand-written table would have to enumerate", () => {
    expect(decodeHtmlEntities("&Delta; &alpha; &isin; &lceil; &hArr; &sum;")).toBe("Δ α ∈ ⌈ ⇔ ∑");
  });

  it("decodes decimal and hex numeric references", () => {
    expect(decodeHtmlEntities("I&#039;ve &#8217;ve &#x27;ve &#X2019;ve")).toBe("I've ’ve 've ’ve");
    expect(decodeHtmlEntities("&#128512;")).toBe("😀");
    // The HTML5 remap of the windows-1252 range, which a legacy export can carry.
    expect(decodeHtmlEntities("&#128;")).toBe("€");
  });

  // Every case here fails without `scope: "strict"`: on the default scope a
  // legacy entity decodes with no closing semicolon. A bare "&" is safe either
  // way — it's an "&" glued to a word that gets rewritten mid-sentence.
  it("requires the closing semicolon", () => {
    expect(decodeHtmlEntities("Bolted 5&times in a day")).toBe("Bolted 5&times in a day");
    expect(decodeHtmlEntities("5&lt6")).toBe("5&lt6");
    expect(decodeHtmlEntities("Cams #3 &#4")).toBe("Cams #3 &#4");
    expect(decodeHtmlEntities("&notit; &amp without a semicolon")).toBe(
      "&notit; &amp without a semicolon",
    );
  });

  it("leaves an ampersand that isn't an entity alone", () => {
    expect(decodeHtmlEntities("Cams #3 & #4, R&D, 5 & 6")).toBe("Cams #3 & #4, R&D, 5 & 6");
    expect(decodeHtmlEntities("AT&T")).toBe("AT&T");
    expect(decodeHtmlEntities("&notanentity; &; &#; &#x;")).toBe("&notanentity; &; &#; &#x;");
  });

  it("replaces a numeric reference that names no character", () => {
    // Per the HTML5 spec: NUL and out-of-range code points become U+FFFD.
    expect(decodeHtmlEntities("&#0;").codePointAt(0)).toBe(0xfffd);
    expect(decodeHtmlEntities("&#1114112;").codePointAt(0)).toBe(0xfffd);
  });

  it("unwraps text an exporter encoded twice", () => {
    expect(decodeHtmlEntities("I&amp;rsquo;ve")).toBe("I’ve");
    expect(decodeHtmlEntities("Salt &amp;amp; Pepper")).toBe("Salt & Pepper");
  });

  it("stops unwrapping rather than eating an escaped entity forever", () => {
    expect(decodeHtmlEntities("&amp;amp;amp;amp;amp;lt;")).toBe("&amp;amp;lt;");
  });

  it("returns text with no ampersand untouched", () => {
    expect(decodeHtmlEntities("Just a normal comment")).toBe("Just a normal comment");
    expect(decodeHtmlEntities("")).toBe("");
  });
});
