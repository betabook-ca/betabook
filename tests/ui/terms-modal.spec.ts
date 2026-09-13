import { test, expect, openStory } from "./story";

test(
  "the terms popup stays compact and keeps keyboard focus inside",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-auth-accept-terms--existing-account");
    const dialog = page.getByRole("dialog", { name: "Terms of Service", exact: true });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    if (!bounds) throw new Error("The terms popup has no visible bounds");
    expect(bounds.width).toBeLessThanOrEqual(420);
    expect(bounds.height).toBeLessThan(420);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Missing browser viewport");
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThan(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(bounds.y + bounds.height).toBeLessThan(viewport.height);
    await dialog.getByRole("link", { name: "Read the Terms of Service" }).focus();
    for (let step = 0; step < 7; step += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await info.attach("terms-popup", {
      body: await page.screenshot({
        fullPage: false,
        animations: "disabled",
        path: info.outputPath("terms-popup.png"),
      }),
      contentType: "image/png",
    });
  },
);
