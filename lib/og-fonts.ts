import {
  BARLOW_CONDENSED_BOLD_TTF_BASE64,
  GEIST_MEDIUM_TTF_BASE64,
} from "@/lib/og-fonts.generated";

/** The two faces the social cards render with — the same split as the rest
 * of the app's `--font-display`/body voices (see app/globals.css): Barlow
 * Condensed Bold for the wordmark and every display moment on a card
 * (climber name, hero numbers), Geist Medium for everything supporting. */
export const OG_FONT = {
  display: "Barlow Condensed",
  body: "Geist Medium",
} as const;

/** Decodes a base64 font payload with no `node:fs` — the deployed Worker has
 * no filesystem, so `lib/og-fonts.generated.ts` embeds the bytes as a plain
 * string instead of a path to read. Same technique as `test/image-fixtures.ts`'s
 * PNG fixture. */
function decodeFontBase64(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0).buffer;
}

type OgFont = { name: string; data: ArrayBuffer; weight: 700 | 500; style: "normal" };

// Decoded once per warm isolate, not once per request: the base64 payload is
// a couple hundred KB, and both routes call `ogFonts()` on every request.
let cachedFonts: OgFont[] | null = null;

/** The `fonts` option for `next/og`'s `ImageResponse`. Both card routes pass
 * this unchanged, so a viewer sees the same two faces on either card. */
export function ogFonts(): OgFont[] {
  if (!cachedFonts) {
    cachedFonts = [
      {
        name: OG_FONT.display,
        data: decodeFontBase64(BARLOW_CONDENSED_BOLD_TTF_BASE64),
        weight: 700,
        style: "normal",
      },
      {
        name: OG_FONT.body,
        data: decodeFontBase64(GEIST_MEDIUM_TTF_BASE64),
        weight: 500,
        style: "normal",
      },
    ];
  }
  return cachedFonts;
}
