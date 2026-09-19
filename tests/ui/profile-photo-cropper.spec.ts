import { expect, openStory, test } from "./story";

/** The cropper is the one part of the upload that cannot be asserted in
 * jsdom: it measures its container, decodes the photo, and the square it
 * produces comes out of a real canvas encoder. Framing behavior and error
 * handling live in components/profile-photo-cropper.dom.test.tsx. */

const result = "crop-result";

test("crops a landscape photo into the square the server stores @behavior", async ({
  page,
}, info) => {
  await openStory(page, info, "components-account-photo-cropper--landscape");

  const area = page.getByLabel("Photo crop area");
  await expect(area).toBeVisible();
  await expect(page.getByTestId(result)).toHaveText("No crop yet");

  await page.getByRole("button", { name: "Use photo" }).click();

  // 512×512 WebP: twice the stored 256 px, so the server's downscale has
  // real pixels to work with.
  await expect(page.getByTestId(result)).toHaveText(/^512×512 image\/webp \(\d+ bytes\)$/);
});

test("uploads well under the action's size cap @behavior", async ({ page }, info) => {
  await openStory(page, info, "components-account-photo-cropper--portrait");

  await page.getByRole("button", { name: "Use photo" }).click();
  await expect(page.getByTestId(result)).toHaveText(/^512×512 image\/webp \(\d+ bytes\)$/);

  const text = await page.getByTestId(result).textContent();
  const bytes = Number(/\((\d+) bytes\)/.exec(text ?? "")?.[1]);
  expect(bytes).toBeGreaterThan(0);
  // The picker's whole reason for cropping client-side: a phone photo
  // becomes a payload a server action accepts without raising its limit.
  expect(bytes).toBeLessThan(300_000);
});

test("the round window frames a square of the photo @behavior", async ({ page }, info) => {
  await openStory(page, info, "components-account-photo-cropper--landscape");

  const area = page.getByLabel("Photo crop area");
  const box = await area.boundingBox();
  if (!box) throw new Error("No crop area rendered");

  // The crop window is round on screen, but what it takes is a square: the
  // circle is a mask over a 1:1 crop.
  const window = page.locator(".reactEasyCrop_CropArea");
  const windowBox = await window.boundingBox();
  if (!windowBox) throw new Error("No crop window rendered");
  expect(Math.abs(windowBox.width - windowBox.height)).toBeLessThanOrEqual(1);
  expect(await window.evaluate((node) => getComputedStyle(node).borderRadius)).toBe("50%");
});

test("dragging the photo changes what gets cropped @behavior", async ({ page }, info) => {
  await openStory(page, info, "components-account-photo-cropper--landscape");

  const area = page.getByLabel("Photo crop area");
  const box = await area.boundingBox();
  if (!box) throw new Error("No crop area rendered");
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.getByRole("button", { name: "Use photo" }).click();
  await expect(page.getByTestId(result)).toHaveText(/^512×512 image\/webp/);
  const centred = await page.getByTestId(result).textContent();

  await page.getByRole("button", { name: "Open the cropper" }).click();
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - box.width / 3, centre.y, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Use photo" }).click();

  // Same dimensions, different pixels: the photo is a four-colour canvas, so
  // moving the frame a third of the way across changes the encoded bytes.
  await expect(page.getByTestId(result)).not.toHaveText(centred ?? "");
  await expect(page.getByTestId(result)).toHaveText(/^512×512 image\/webp/);
});

test("rotating turns the photo a quarter at a time @behavior", async ({ page }, info) => {
  await openStory(page, info, "components-account-photo-cropper--portrait");

  await page.getByRole("button", { name: "Use photo" }).click();
  await expect(page.getByTestId(result)).toHaveText(/^512×512 image\/webp/);
  const upright = await page.getByTestId(result).textContent();

  await page.getByRole("button", { name: "Open the cropper" }).click();
  await page.getByRole("button", { name: "Rotate" }).click();
  await page.getByRole("button", { name: "Use photo" }).click();

  await expect(page.getByTestId(result)).not.toHaveText(upright ?? "");
  await expect(page.getByTestId(result)).toHaveText(/^512×512 image\/webp/);
});

test("the zoom slider is operable from the keyboard @behavior", async ({ page }, info) => {
  await openStory(page, info, "components-account-photo-cropper--landscape");

  const zoom = page.getByRole("slider", { name: /zoom/i });
  await zoom.focus();
  const before = await zoom.getAttribute("aria-valuenow");
  await page.keyboard.press("ArrowRight");

  // Someone framing a photo without a pointer still has to be able to zoom.
  await expect(zoom).not.toHaveAttribute("aria-valuenow", before ?? "1");
});
