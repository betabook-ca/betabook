import { decode } from "html-entities";

/** Some exporters encode twice ("&amp;rsquo;"); the cap stops text genuinely
 * written "&amp;amp;amp;…" from unravelling indefinitely. */
const MAX_PASSES = 3;

/**
 * Decodes entities in text that was never meant to be HTML — a Sendage export's
 * "I&rsquo;ve". The result is stored and rendered as plain text, so turning
 * "&lt;" back into "<" is safe here in a way it wouldn't be if it reached markup.
 *
 * `scope: "strict"` requires the closing semicolon. On the library's default
 * (HTML5 parser) scope a legacy entity decodes without one, so "Bolted 5&times
 * in a day" becomes "Bolted 5× in a day" and "Cams #3 &#4" gains a control
 * character. A bare "&" is safe either way; an "&" glued to a word is not.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  let decoded = text;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = decode(decoded, { scope: "strict" });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}
