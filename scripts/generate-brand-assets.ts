import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

async function main() {
  // Embed the exact system fonts so standalone SVGs and their PNG previews
  // render identically, without relying on fonts installed on the viewer's OS.
  const root = new URL("../", import.meta.url);
  const publicBrand = new URL("public/branding/", root);
  await mkdir(publicBrand, { recursive: true });
  const displayFont = await readFile(
    new URL("assets/fonts/barlow-condensed-700-latin.woff2", root),
    "base64",
  );
  const bodyFont = await readFile(
    new URL("node_modules/geist/dist/fonts/geist-sans/Geist-Medium.woff2", root),
    "base64",
  );
  const theme = await readFile(new URL("app/globals.css", root), "utf8");
  function palette(name: string) {
    const match = theme.match(new RegExp(`--palette-${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`Missing palette color: ${name}`);
    return match[1].trim();
  }

  // The mountain keeps its broad base. The check's rising edges converge
  // from a substantial join at (282, 131) to a narrow, almost pointed tip.
  const mountain =
    "M129 151 L202 78 Q205 75 208 78 L237 108 L249 97 Q252 94 255 97 L282 124 L359 62 Q361 60.5 360 63 L285 138 Q282 141 279 138 L252 111 L240 122 Q237 125 234 122 L205 92 L147 151 Z";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
    for (const [treatment, color] of [
      ["light", palette("ink")],
      ["dark", palette("paper")],
    ]) {
      const mark = `<path d="${mountain}" fill="${color}"/>
<circle cx="312" cy="60" r="14" fill="#ef846c"/>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 320" role="img" aria-labelledby="title">
<title id="title">Betabook — Climb, Log, Progress. A mountain becomes a checkmark beneath the sun.</title>
<style>
@font-face { font-family: "Barlow Condensed"; src: url("data:font/woff2;base64,${displayFont}") format("woff2"); font-weight: 700; }
@font-face { font-family: "Geist"; src: url("data:font/woff2;base64,${bodyFont}") format("woff2"); font-weight: 500; }
</style>
<g fill="${color}">
${mark}
<text x="250" y="237" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="92" letter-spacing="1">betabook</text>
<text x="250" y="274" text-anchor="middle" font-family="Geist" font-size="11" font-weight="500" letter-spacing="4">CLIMB<tspan fill="#ef846c"> · </tspan>LOG<tspan fill="#ef846c"> · </tspan>PROGRESS</text>
</g>
</svg>\n`;
      const base = new URL(`assets/branding/betabook-lockup-${treatment}`, root);
      await writeFile(`${fileURLToPath(base)}.svg`, svg);
      await writeFile(new URL(`betabook-lockup-${treatment}.svg`, publicBrand), svg);
      // Crop the approved wordmark without changing its font, spacing or geometry.
      const wordmark = svg
        .replace('viewBox="0 0 500 320"', 'viewBox="90 170 320 80"')
        .replace(mark, "")
        .replace(/<text x="250" y="274"[\s\S]*?<\/text>/, "");
      await writeFile(new URL(`betabook-wordmark-${treatment}.svg`, publicBrand), wordmark);
      await page.setViewportSize({ width: 1000, height: 640 });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:1000px;height:640px}</style>${svg}`,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${fileURLToPath(base)}.png`, omitBackground: true });
      if (treatment === "light") {
        // The complete About-page artwork, on a stable paper canvas for inboxes
        // that recolor HTML backgrounds. Preserve the original 500:320 proportions.
        await page.addStyleTag({ content: `html,body{background:${palette("paper")}}` });
        await page.screenshot({
          path: fileURLToPath(new URL("betabook-lockup-email.png", publicBrand)),
        });
      }
      if (treatment === "dark") {
        await page.setViewportSize({ width: 1200, height: 630 });
        await page.setContent(
          `<style>html,body{margin:0;background:${palette("ink")}}body{height:630px;display:grid;place-items:center}svg{width:800px;height:512px}</style>${svg}`,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: fileURLToPath(new URL("app/opengraph-image.png", root)) });
      }

      // Square canvas centers the original mark with breathing room at the edges.
      // Share its geometry with the lockup so the icon cannot drift independently.
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="113 -34 264 264" role="img" aria-labelledby="title">
<title id="title">Betabook: a mountain turning into a checkmark, with a sun.</title>
${mark}
</svg>\n`;
      const iconBase = fileURLToPath(new URL(`assets/branding/betabook-icon-${treatment}`, root));
      await writeFile(`${iconBase}.svg`, icon);
      await writeFile(new URL(`betabook-icon-${treatment}.svg`, publicBrand), icon);
      await page.setViewportSize({ width: 512, height: 512 });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:512px;height:512px}</style>${icon}`,
      );
      await page.screenshot({ path: `${iconBase}.png`, omitBackground: true });
      if (treatment === "light") {
        // Launchers need a stable opaque canvas; retain paper with the ink mark.
        // These are ordinary icons, not maskable: no platform crop is promised.
        for (const size of [180, 192, 512]) {
          await page.setViewportSize({ width: size, height: size });
          await page.setContent(
            `<style>html,body{margin:0;background:${palette("paper")}}svg{display:block;width:${size}px;height:${size}px}</style>${icon}`,
          );
          await page.screenshot({
            path: fileURLToPath(
              size === 180
                ? new URL("app/apple-icon.png", root)
                : new URL(`app-icon-${size}.png`, publicBrand),
            ),
          });
        }
      }

      // Optical cut for 16–32px: taller silhouette, wider mountain strokes,
      // a larger sun, and a finite check tip instead of a subpixel hairline.
      // This is deliberately redrawn, not a distorted scale of the full logo.
      const smallIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-labelledby="title">
<title id="title">Betabook: a mountain turning into a checkmark, with a sun.</title>
<path fill="${color}" d="M2 25 L10 13 Q11 11 12 13 L16 17 L18 15 Q19 14 20 15 L23 19 L30 9 L31 10 L24 23 Q23 24 22 23 L19 19 L17 21 Q16 22 15 21 L11 17 L6 25 Z"/>
<circle cx="24" cy="7" r="2.5" fill="#ef846c"/>
</svg>\n`;
      const smallBase = fileURLToPath(
        new URL(`assets/branding/betabook-icon-small-${treatment}`, root),
      );
      await writeFile(`${smallBase}.svg`, smallIcon);
      await page.setViewportSize({ width: 64, height: 64 });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:64px;height:64px}</style>${smallIcon}`,
      );
      await page.screenshot({ path: `${smallBase}.png`, omitBackground: true });
      if (treatment === "light") {
        // Browser tabs follow the browser/OS scheme, independently of app theme.
        const adaptiveIcon = smallIcon
          .replace("<svg ", '<svg width="32" height="32" ')
          .replace(
            `<path fill="${color}"`,
            `<style>:root{color:${palette("ink")}}@media(prefers-color-scheme:dark){:root{color:${palette("paper")}}}</style><path fill="currentColor"`,
          );
        await writeFile(new URL("app/icon.svg", root), adaptiveIcon);
        const frames: Buffer[] = [];
        for (const size of [16, 32]) {
          await page.setViewportSize({ width: size, height: size });
          await page.setContent(
            `<style>html,body{margin:0;background:${palette("paper")}}svg{display:block;width:${size}px;height:${size}px}</style>${smallIcon}`,
          );
          // Canvas PNG encoding retains RGBA, required by Next's ICO decoder.
          const png = await page.evaluate(async () => {
            const image = new Image();
            const svg = document.querySelector("svg");
            if (!svg) throw new Error("Missing icon SVG");
            image.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = window.innerWidth;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas unavailable");
            context.fillStyle = getComputedStyle(document.body).backgroundColor;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/png").split(",")[1];
          });
          frames.push(Buffer.from(png, "base64"));
        }
        // ICO directory with PNG frames, supported by modern browsers and OSes.
        const directory = Buffer.alloc(6 + frames.length * 16);
        directory.writeUInt16LE(1, 2);
        directory.writeUInt16LE(frames.length, 4);
        let offset = directory.length;
        for (const [index, frame] of frames.entries()) {
          const entry = 6 + index * 16;
          directory[entry] = directory[entry + 1] = index === 0 ? 16 : 32;
          directory.writeUInt16LE(1, entry + 4);
          directory.writeUInt16LE(32, entry + 6);
          directory.writeUInt32LE(frame.length, entry + 8);
          directory.writeUInt32LE(offset, entry + 12);
          offset += frame.length;
        }
        await writeFile(new URL("app/favicon.ico", root), Buffer.concat([directory, ...frames]));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
