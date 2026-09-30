import { expect, openStory, test } from "./story";

test(
  "recap pages present cover, breakthroughs, analytics highlights, and favorite climbs",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-analytics-linked-recap-story--cover");
    const story = page.getByRole("region", { name: "Recap pages" });
    const viewport = page.viewportSize();
    const coverBox = await story.boundingBox();
    if (!viewport || !coverBox) throw new Error("Recap viewport must be visible");
    expect(coverBox).toMatchObject({ x: expect.any(Number), y: 0, height: viewport.height });
    if (info.project.name.startsWith("mobile")) expect(coverBox.width).toBe(viewport.width);

    const next = page.getByRole("button", { name: "Next recap page" });
    await expect(next).toBeVisible();
    const nextColor = await next.evaluate((element) => getComputedStyle(element).color);
    expect(nextColor).not.toBe("rgba(0, 0, 0, 0)");

    await next.click();
    const breakthroughs = story.getByRole("region", { name: "Grade breakthroughs recap" });
    await expect(breakthroughs.getByRole("heading", { name: "Grade breakthroughs" })).toBeVisible();
    await expect(breakthroughs.getByRole("region", { name: /breakthrough$/ })).toHaveCount(4);
    await expect(page.getByText(/2 \/ 4 · Breakthroughs/)).toBeVisible();

    await next.click();
    const highlights = story.getByRole("region", { name: "Analytics highlights recap" });
    await expect(highlights.getByRole("region", { name: "Favorite partner" })).toContainText(
      "Sam Chen",
    );
    await expect(highlights.getByRole("region", { name: "Most sessioned climb" })).toContainText(
      "12 sessions",
    );
    await expect(highlights.getByRole("region", { name: "Most sessions in a day" })).toContainText(
      "Sep 20, 2026",
    );
    await expect(page.getByText(/3 \/ 4 · Highlights/)).toBeVisible();

    await next.click();
    const favorites = story.getByRole("region", { name: "Favorite climbs recap" });
    await expect(
      favorites.getByRole("list", { name: "Highest rated climbs" }).getByRole("listitem"),
    ).toHaveCount(6);
    const rating = favorites.getByLabel("Rated 5 out of 5 stars").first();
    await expect(rating).toHaveText("5");
    const ratingStyle = await rating.evaluate((element) => {
      const star = element.querySelector("svg");
      return {
        background: getComputedStyle(element).backgroundColor,
        borderWidth: getComputedStyle(element).borderTopWidth,
        text: getComputedStyle(element).color,
        star: star ? getComputedStyle(star).color : "",
      };
    });
    expect(ratingStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(ratingStyle.borderWidth).toBe("0px");
    expect(ratingStyle.star).not.toBe(ratingStyle.text);
    await expect(page.getByText(/4 \/ 4 · Favorites/)).toBeVisible();
    await expect(next).toBeDisabled();

    expect(await story.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    );
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe(
      "hidden",
    );
  },
);

test(
  "breakthrough grades and climb details align across disciplines",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-analytics-linked-recap-story--breakthroughs");
    if (info.project.name.startsWith("mobile"))
      await page.setViewportSize({ width: 320, height: 568 });
    const milestones = page.getByRole("region", { name: "Grade breakthroughs recap" });
    const cards = [
      milestones.getByRole("region", { name: "Boulder V7 breakthrough" }),
      milestones.getByRole("region", { name: "Boulder V5 breakthrough" }),
      milestones.getByRole("region", { name: "Sport 5.12c breakthrough" }),
    ];
    const grades = await Promise.all(
      cards.map((card) => card.locator("[data-recap-breakthrough-grade]").boundingBox()),
    );
    const details = await Promise.all(
      cards.map((card) => card.locator("[data-recap-breakthrough-details]").boundingBox()),
    );
    const [firstGrade, secondGrade, sportGrade] = grades;
    const [firstDetails, secondDetails, sportDetails] = details;
    if (
      !firstGrade ||
      !secondGrade ||
      !sportGrade ||
      !firstDetails ||
      !secondDetails ||
      !sportDetails
    )
      throw new Error("Breakthrough columns must have rendered bounds");
    expect(secondGrade.x).toBeCloseTo(firstGrade.x, 0);
    expect(sportGrade.x).toBeCloseTo(firstGrade.x, 0);
    expect(secondDetails.x).toBeCloseTo(firstDetails.x, 0);
    expect(sportDetails.x).toBeCloseTo(firstDetails.x, 0);
  },
);

test("six named breakthroughs fit without clipping", { tag: "@layout" }, async ({ page }, info) => {
  await openStory(page, info, "components-analytics-linked-recap-story--six-breakthroughs");
  if (info.project.name.startsWith("mobile"))
    await page.setViewportSize({ width: 320, height: 568 });
  const story = page.getByRole("region", { name: "Recap pages" });
  const namesFit = await story.locator("[data-recap-breakthrough-name]").evaluateAll((elements) =>
    elements.map((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    })),
  );
  expect(namesFit).toHaveLength(6);
  for (const size of namesFit) {
    expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight + 1);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1);
  }
});

test(
  "thirteen breakthroughs stay grouped by discipline",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-analytics-linked-recap-story--thirteen-breakthroughs");
    if (info.project.name.startsWith("mobile"))
      await page.setViewportSize({ width: 320, height: 568 });
    const milestones = page.getByRole("region", { name: "Grade breakthroughs recap" });
    const categories = milestones.getByRole("group", { name: "Breakthrough categories" });
    const boulderCategory = categories.getByRole("button", { name: "Boulder · 12" });
    await expect(boulderCategory).toHaveAttribute("aria-pressed", "true");
    expect(
      Number(await boulderCategory.evaluate((element) => getComputedStyle(element).fontWeight)),
    ).toBeGreaterThanOrEqual(700);
    const boulder = milestones.getByRole("region", { name: "Boulder breakthroughs" });
    await expect(boulder.getByRole("region", { name: "Boulder V11 breakthrough" })).toContainText(
      "Midnight Traverse",
    );
    await boulder.getByRole("button", { name: "Older" }).click();
    await expect(boulder.getByRole("region", { name: "Boulder V1 breakthrough" })).toContainText(
      "Stone Garden",
    );
    await categories.getByRole("button", { name: "Sport · 1" }).click();
    await expect(
      milestones
        .getByRole("region", { name: "Sport breakthroughs" })
        .getByRole("region", { name: "Sport 5.12c breakthrough" }),
    ).toContainText("Sport high point");
  },
);

test(
  "a one-discipline cover keeps three useful summary cards",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-analytics-linked-recap-story--one-discipline-cover");
    if (info.project.name.startsWith("mobile"))
      await page.setViewportSize({ width: 320, height: 568 });
    const highlights = page.getByRole("group", { name: "Cover highlights" });
    await expect(highlights.getByRole("region")).toHaveCount(3);
    await expect(highlights.getByRole("region", { name: "Boulder summary" })).toContainText("43");
    await expect(highlights.getByRole("region", { name: "Hardest send summary" })).toContainText(
      "V7",
    );
    await expect(highlights.getByRole("region", { name: "Flash rate summary" })).toContainText(
      "42%",
    );
  },
);

test(
  "every recap layout stays clear of fixed controls",
  { tag: "@layout" },
  async ({ page }, info) => {
    const cases = [
      { id: "cover", last: "Climbing days calendar" },
      { id: "breakthroughs", last: "Trad 5.10d breakthrough" },
      { id: "six-breakthroughs", last: "Sport 5.11a breakthrough" },
      { id: "thirteen-breakthroughs", last: "Older" },
      { id: "highlights", last: "Persistence paid off" },
      { id: "favorite-climbs", last: "Forest Warmup" },
      { id: "one-discipline-cover", last: "Climbing days calendar" },
    ];
    for (const item of cases) {
      await openStory(page, info, `components-analytics-linked-recap-story--${item.id}`);
      if (info.project.name.startsWith("mobile"))
        await page.setViewportSize({ width: 320, height: 568 });
      const story = page.getByRole("region", { name: "Recap pages" });
      const title = await page.getByRole("heading", { level: 1 }).boundingBox();
      const bottom = await page.locator("[data-recap-bottom-navigation]").boundingBox();
      const sectionHeader = page.locator("[data-recap-section-header]");
      const body = page.locator("[data-recap-page-body]");
      const last = item.id.endsWith("cover")
        ? story.getByRole("region", { name: item.last })
        : item.id === "breakthroughs"
          ? story.getByRole("region", { name: item.last })
          : item.id === "six-breakthroughs"
            ? story.getByRole("region", { name: item.last })
            : item.id === "thirteen-breakthroughs"
              ? story.getByRole("button", { name: item.last })
              : item.id === "highlights"
                ? story.getByRole("region", { name: item.last })
                : story.getByText(item.last, { exact: true }).last();
      const content = await last.boundingBox();
      if (!title || !bottom || !content) throw new Error(`${item.id} must have bounds`);
      if (item.id.endsWith("cover")) {
        const brand = await story.getByRole("img", { name: "Betabook logo" }).boundingBox();
        if (!brand) throw new Error(`${item.id} brand must have bounds`);
        expect(brand.y).toBeGreaterThanOrEqual(title.y + title.height);
      }
      expect(content.y + content.height).toBeLessThanOrEqual(bottom.y);
      if ((await sectionHeader.count()) > 0 && (await body.count()) > 0) {
        const headerBox = await sectionHeader.boundingBox();
        const bodyBox = await body.boundingBox();
        const pageHeading = await sectionHeader.getByRole("heading", { level: 2 }).boundingBox();
        if (!headerBox || !bodyBox || !pageHeading)
          throw new Error(`${item.id} header must have bounds`);
        expect(pageHeading.y + pageHeading.height).toBeLessThanOrEqual(
          headerBox.y + headerBox.height,
        );
        expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(bodyBox.y);
      }
      expect(await story.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      );
    }
  },
);
