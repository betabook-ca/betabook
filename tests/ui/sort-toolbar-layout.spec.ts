import { test, expect, openStory } from "./story";

const middle = (box: { y: number; height: number }) => box.y + box.height / 2;

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`sort shares the search row at ${width}px and stays above expanded filters`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page, info, "components-filters-sends-toolbar--responsive");
    const toolbar = page.getByRole("group", { name: "Filter controls", exact: true });
    const search = page
      .locator('[data-slot="search-field-group"]')
      .filter({ has: page.getByPlaceholder("Filter sends…") });
    const label = page.getByText("Sort by", { exact: true });
    const sort = page.getByRole("button", { name: "Date Sort by", exact: true });
    const direction = page.getByRole("button", { name: "Sort descending", exact: true });
    const chip = page.getByRole("button", { name: "Boulder", exact: true });
    const [bounds, searchBox, field, arrow, title, chipBox] = await Promise.all([
      toolbar.boundingBox(),
      search.boundingBox(),
      sort.boundingBox(),
      direction.boundingBox(),
      label.boundingBox(),
      chip.boundingBox(),
    ]);
    if (!bounds || !searchBox || !field || !arrow || !title || !chipBox)
      throw new Error("Missing toolbar geometry");
    expect(field.width).toBe(112);
    expect(arrow.x + arrow.width).toBeCloseTo(bounds.x + bounds.width);
    expect(arrow.y).toBeCloseTo(field.y);
    expect(middle(field)).toBeCloseTo(middle(searchBox), 0);
    if (width >= 1024) {
      expect(middle(chipBox)).toBeCloseTo(middle(searchBox), 0);
      await expect(label).toHaveCSS("font-size", "12px");
      expect(title.x + title.width).toBeLessThanOrEqual(field.x);
      expect(middle(title)).toBeCloseTo(middle(field), 0);
    } else {
      expect(chipBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
      if (width < 768) expect(title.width).toBeLessThanOrEqual(1);
    }

    await page.getByRole("button", { name: "Expand filters", exact: true }).click();
    const panel = page.getByRole("region", { name: "Filter options", exact: true });
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const [panelBox, sortBox] = await Promise.all([panel.boundingBox(), sort.boundingBox()]);
        return Boolean(panelBox && sortBox && sortBox.y + sortBox.height <= panelBox.y);
      })
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
