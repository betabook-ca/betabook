import { expect, openStory, test } from "./story";

test(
  "friend filter opens its list within the viewport",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-filters-journal-toolbar--expanded");
    await page.getByRole("combobox", { name: "With friend" }).click();
    const option = page.getByRole("option", { name: "Sam Rivera" });
    await expect(option).toBeVisible();
    const menu = page.getByRole("listbox");
    const bounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Expected a visible menu and configured viewport");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await testInfo.attach("friend-dropdown", {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "With friend" })).toBeFocused();
  },
);
