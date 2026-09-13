import { test, expect, openStory } from "./story";

test(
  "minimum ascents accepts direct counts and clears without stepper buttons",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-filters-climb-statistics--default");
    const input = page.getByRole("textbox", { name: "Min ascents", exact: true });
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("0");
    expect((await input.locator("..").boundingBox())?.width).toBe(112);
    await expect(
      page.getByRole("button", { name: /Increase|Decrease|Increment|Decrement/i }),
    ).toHaveCount(0);
    await input.fill("100");
    await input.press("Tab");
    await expect(page.getByLabel("Selected statistics")).toContainText('"minAscents":100');
    await input.fill("");
    await input.press("Tab");
    await expect(page.getByLabel("Selected statistics")).toContainText('"minAscents":0');
    await page.screenshot({ path: info.outputPath("min-ascents.png"), fullPage: true });
  },
);
