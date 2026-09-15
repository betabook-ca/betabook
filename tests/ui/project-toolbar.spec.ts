import { expect, openStory, test } from "./story";

test(
  "project search and standard-width sort share one row",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-project-board--projects");
    const search = await page.getByRole("searchbox", { name: "Filter projects" }).boundingBox();
    const sort = await page.getByRole("button", { name: "Sort projects" }).boundingBox();
    if (!search || !sort) throw new Error("Expected project search and sort controls");
    expect(Math.abs(search.y + search.height / 2 - sort.y - sort.height / 2)).toBeLessThanOrEqual(
      1,
    );
    expect(sort.width).toBe(176);
  },
);
