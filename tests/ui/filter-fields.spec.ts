import { test, expect, openStory } from "./story";

for (const toolbar of ["sends", "journal"]) {
  test(
    `${toolbar} filter fields share alignment and widths`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, `components-filters-${toolbar}-toolbar--default`);
      await page.getByRole("button", { name: /^(Expand|Hide) filters$/ }).click();
      const dates = page.getByRole("button", { name: "All time Dates", exact: true });
      const hashtag = page.getByRole("combobox", { name: "Tags", exact: true });
      await expect(dates).toBeVisible();
      await expect(hashtag).toBeVisible();
      const dateBox = await dates.boundingBox();
      const tagBox = await hashtag.boundingBox();
      if (!dateBox || !tagBox) throw new Error("Missing filter bounds");
      expect(Math.abs(dateBox.x - tagBox.x)).toBeLessThan(2);
      expect(tagBox.width).toBe(176);
      if (toolbar === "sends") {
        const area = page.getByRole("combobox", { name: "Filter by area", exact: true });
        await expect(area).toHaveAttribute("placeholder", "Filter by area…");
        await expect(page.getByText("Filter by area", { exact: true })).toHaveCount(0);
        const areaBox = await area.boundingBox();
        if (!areaBox) throw new Error("Missing area bounds");
        expect(Math.abs(areaBox.x - tagBox.x)).toBeLessThan(2);
        if (!areaBox) throw new Error("Missing area bounds");
        expect(areaBox.width).toBeGreaterThan(tagBox.width);
      }
      await page.screenshot({
        path: info.outputPath(`${toolbar}-filters.png`),
        fullPage: true,
        animations: "disabled",
      });
    },
  );
}

test(
  "standard short, medium and long fields use the shared widths",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "patterns-fields-standard-widths--comparison");
    const short = await page
      .getByRole("button", { name: "V0 Min grade", exact: true })
      .boundingBox();
    const medium = await page
      .getByRole("button", { name: "All time Dates", exact: true })
      .boundingBox();
    const long = await page
      .getByRole("group")
      .filter({ has: page.getByRole("searchbox", { name: "Filter sends" }) })
      .boundingBox();
    if (!short || !medium || !long) throw new Error("Missing standard fields");
    expect(short.width).toBe(112);
    expect(medium.width).toBe(176);
    expect(long.width).toBe(Math.min(384, (info.project.use.viewport?.width ?? 1024) - 32));
    await page.screenshot({
      path: info.outputPath("standard-fields.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

test(
  "compact medium fields fit custom dates without clipping",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-filters-date-filter--any");
    await page.getByRole("button", { name: "All time Dates" }).click();
    await page.getByRole("option", { name: "Custom dates", exact: true }).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    const date = page.getByRole("group", { name: "Start date", exact: true });
    const year = date.getByRole("spinbutton", { name: /year/ });
    const calendar = date.getByRole("button", { name: "Calendar Start date" });
    const yearBox = await year.boundingBox();
    const calendarBox = await calendar.boundingBox();
    if (!yearBox || !calendarBox) throw new Error("Missing date controls");
    expect(yearBox.x + yearBox.width).toBeLessThanOrEqual(calendarBox.x);
    expect(await year.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({
      path: info.outputPath("compact-dates.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

for (const story of [
  "components-filters-sends-toolbar--expanded",
  "components-filters-journal-toolbar--expanded",
  "components-filters-climb-filters--expanded",
  "components-filters-climb-statistics--default",
]) {
  test(
    `${story} labels align with controls, independently of helper text`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, story);
      const pairs = [
        ["Dates", page.getByRole("button", { name: "All time Dates", exact: true })],
        ["Tags", page.getByRole("combobox", { name: "Tags", exact: true })],
        ["Area", page.getByRole("combobox", { name: "Filter by area", exact: true })],
        ["Ascent style", page.getByRole("button", { name: "Redpoint", exact: true })],
        ["Min ascents", page.getByRole("spinbutton", { name: "Min ascents", exact: true })],
        [
          "Rating",
          page
            .getByRole("radiogroup", { name: "Min rating", exact: true })
            .getByRole("radio", { name: "1 star", exact: true }),
        ],
      ] as const;
      let checked = 0;
      for (const [name, control] of pairs) {
        if (!(await control.count())) continue;
        const label = page.getByText(name, { exact: true }).first();
        const [a, b] = await Promise.all([label.boundingBox(), control.boundingBox()]);
        if (!a || !b) throw new Error(`Missing ${name} geometry`);
        if ((info.project.use.viewport?.width ?? 0) >= 640)
          expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2), name).toBeLessThan(1);
        else expect(a.y + a.height, name).toBeLessThanOrEqual(b.y);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
    },
  );
}

test("search, sort, direction, chips and the filter toggle share the field height including theme borders", async ({
  page,
}, info) => {
  await openStory(page, info, "components-filters-sends-toolbar--default");
  const search = page
    .locator('[data-slot="search-field-group"]')
    .filter({ has: page.getByPlaceholder("Filter sends…") });
  const sort = page.getByRole("button", { name: /Sort by/ });
  const direction = page.getByRole("button", { name: "Sort descending", exact: true });
  for (const border of [null, "4px"]) {
    if (border)
      await page.evaluate(
        (value) => document.documentElement.style.setProperty("--field-border-width", value),
        border,
      );
    const height = await search.evaluate((element) => getComputedStyle(element).height);
    await expect(sort).toHaveCSS("height", height);
    await expect(direction).toHaveCSS("height", height);
    await expect(page.getByRole("button", { name: "Boulder", exact: true })).toHaveCSS(
      "height",
      height,
    );
    await expect(page.getByRole("button", { name: "Expand filters", exact: true })).toHaveCSS(
      "height",
      height,
    );
  }
});
