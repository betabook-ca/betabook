import { test, expect, openStory } from "./story";

test(
  "rating range uses result-sized stars and one icon tag, then resets both bounds",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-filters-sends-toolbar--default");
    await page.getByRole("button", { name: "Expand filters", exact: true }).click();
    const min = page.getByRole("radiogroup", { name: "Min rating", exact: true });
    const max = page.getByRole("radiogroup", { name: "Max rating", exact: true });
    await expect(min.getByRole("radio", { name: "1 star", exact: true })).toBeChecked();
    await expect(max.getByRole("radio", { name: "5 stars", exact: true })).toBeChecked();
    await expect(page.getByRole("region", { name: "Active filters" })).toHaveCount(0);
    await min.getByRole("radio", { name: "2 stars" }).click();
    await max.getByRole("radio", { name: "4 stars" }).click();
    const summary = page.getByRole("region", { name: "Active filters" });
    const tag = summary.getByRole("button", { name: "Remove Rating: 2–4 stars", exact: true });
    await expect(tag).toBeVisible();
    await expect(summary.getByRole("button", { name: /^Remove Rating:/ })).toHaveCount(1);
    expect((await min.locator("svg").first().boundingBox())?.width).toBe(16);
    await expect(tag.locator("svg.lucide-star")).toHaveCount(2);
    await page.screenshot({ path: info.outputPath("rating-range.png"), fullPage: true });
  },
);
