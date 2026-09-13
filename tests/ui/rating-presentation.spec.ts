import { test, expect, openStory } from "./story";

test(
  "rating range label and stars share a vertical center on desktop",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-filters-minimum-rating--rated");
    const label = page.getByText("Rating", { exact: true });
    const stars = page.getByRole("radiogroup", { name: "Min rating", exact: true });
    await expect(stars).toBeVisible();
    const labelBox = await label.boundingBox();
    const starsBox = await stars.boundingBox();
    if (!labelBox || !starsBox) throw new Error("Missing rating controls");
    if ((info.project.use.viewport?.width ?? 0) >= 640) {
      expect(
        Math.abs(labelBox.y + labelBox.height / 2 - starsBox.y - starsBox.height / 2),
      ).toBeLessThan(1);
    }
    await page.screenshot({ path: info.outputPath("rating-alignment.png"), fullPage: true });
  },
);

test(
  "display ratings place the number before the star",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-data-display-rating-stars--ratings");
    const rating = page.getByText("2.5", { exact: true });
    await expect(rating).toBeVisible();
    const positions = await rating.evaluate((element) => {
      const number = document.createRange();
      const text = element.firstChild;
      const star = element.querySelector("svg");
      if (!text || !star) throw new Error("Missing rating content");
      number.selectNodeContents(text);
      return {
        numberRight: number.getBoundingClientRect().right,
        starLeft: star.getBoundingClientRect().left,
      };
    });
    expect(positions.numberRight).toBeLessThan(positions.starLeft);
  },
);
