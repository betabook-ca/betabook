import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { Page } from "@playwright/test";

import { expect, openStory, test } from "./story";

const STORY = "components-account-share-profile--public";
const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";
const SHARE_URL = `https://betabook.ca/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=${TOKEN}`;
const JSQR = createRequire(import.meta.url).resolve("jsqr/dist/jsQR.js");

// jsQR still decodes black modules on a dark card, so also report the colors a
// phone camera needs: a white quiet zone and black modules.
const SCANNABLE = { text: SHARE_URL, quietZone: [255, 255, 255, 255], darkest: 0 };

async function scan(page: Page, png: Uint8Array) {
  await page.addScriptTag({ path: JSQR });
  return page.evaluate(async (bytes: number[]) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let darkest = 255;
    for (let offset = 0; offset < data.length; offset += 4) {
      darkest = Math.min(darkest, data[offset], data[offset + 1], data[offset + 2]);
    }
    const { jsQR } = window as unknown as {
      jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
    };
    // Inside the four-module border, clear of edge pixels a fractional layout
    // position blends with the card.
    const inset = Math.round(canvas.width * 0.04);
    const quietZone = (inset * canvas.width + inset) * 4;
    return {
      text: jsQR(data, canvas.width, canvas.height)?.data ?? null,
      quietZone: Array.from(data.slice(quietZone, quietZone + 4)),
      darkest,
    };
  }, Array.from(png));
}

test("the profile QR code scans in the current theme without sending the link anywhere", async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()} ${request.postData() ?? ""}`));
  await openStory(page, testInfo, STORY);

  const qr = page.getByRole("img", { name: "QR code for your profile link" });
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(qr).toBeHidden();
    await page.getByRole("button", { name: "Show QR code" }).click();
    await expect(qr).toBeVisible();
  }
  const png = await qr.screenshot();

  expect(await scan(page, png)).toEqual(SCANNABLE);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((request) => request.includes(TOKEN))).toEqual([]);
  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Hide QR code" }).click();
    await expect(qr).toBeHidden();
  }
});

test("the downloaded QR code image scans", { tag: "@behavior" }, async ({ page }, testInfo) => {
  await openStory(page, testInfo, STORY);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download QR code" }).click();
  const file = await download;

  expect(file.suggestedFilename()).toBe("betabook-profile-qr.png");
  expect(await scan(page, await readFile(await file.path()))).toEqual(SCANNABLE);
});
