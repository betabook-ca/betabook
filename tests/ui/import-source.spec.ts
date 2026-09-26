import { expect, openStory, test } from "./story";

test(
  "the import source picker stays inside its card at every width",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-import-import-source--sendage");
    const mobile = (info.project.use.viewport?.width ?? 0) < 768;
    const fieldset = page.locator("fieldset", { has: page.getByText("Import from") });
    const segmented = page.getByRole("button", { name: "Mountain Project" });
    if (mobile) await expect(segmented).toBeHidden();
    else await expect(segmented).toBeVisible();

    const controls = fieldset.locator("> :not(legend)").filter({ visible: true });
    expect(await controls.count()).toBe(1);
    const card = await fieldset.boundingBox();
    const box = await controls.first().boundingBox();
    if (!card || !box) throw new Error("The picker did not render");
    expect(box.x).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  },
);
