import { expect, test, openStory } from "./story";

test("@layout goal category chooser uses a mobile sheet before the full form", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--active");
  await page.getByRole("button", { name: "Set goal" }).click();
  const dialog = page.getByRole("dialog", { name: "Set goal" });
  await expect(page.getByRole("heading", { name: "What do you want to work on?" })).toBeVisible();
  if (!info.project.name.startsWith("mobile")) return;

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Expected a fixed mobile viewport");
  const firstScreen = await dialog.boundingBox();
  if (!firstScreen) throw new Error("Expected the goal category sheet");
  expect(firstScreen.height).toBeLessThan(viewport.height * 0.85);

  await page.getByRole("button", { name: /Training Set a session target/ }).click();
  await expect(page.getByRole("heading", { name: "Training", exact: true })).toBeVisible();
  await expect
    .poll(async () => (await dialog.boundingBox())?.height)
    .toBeGreaterThan(viewport.height * 0.95);
  await page.getByRole("button", { name: "Back" }).click();
  await expect
    .poll(async () => (await dialog.boundingBox())?.height)
    .toBeLessThan(viewport.height * 0.85);
});

test("goal progress track remains visible in dark mode", async ({ page }, info) => {
  await openStory(page, info, "components-goals-goal-panel--active");
  if (info.project.name.endsWith("dark")) {
    await expect(page.getByRole("progressbar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  } else {
    await expect(page.getByRole("progressbar")).toBeVisible();
  }
});

test("goal rows begin directly below the toolbar without extra first-row padding", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--active");
  const navigation = page.getByRole("navigation", { name: "Goal views" });
  for (const tab of await navigation.getByRole("button").all()) {
    await tab.hover();
    await expect(tab).toHaveCSS("cursor", "pointer");
  }
  const toolbar = await navigation.locator("../..").boundingBox();
  const row = await page.locator(".divide-y > div").first().boundingBox();
  if (!toolbar || !row) throw new Error("Expected goals toolbar and first row");
  expect(Math.abs(row.y - toolbar.y - toolbar.height)).toBeLessThanOrEqual(1);
});

test("@layout empty goal history uses the active row's vertical padding", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--active");
  const activePadding = await page
    .locator(".divide-y > div")
    .first()
    .evaluate((row) => ({
      top: getComputedStyle(row).paddingTop,
      bottom: getComputedStyle(row).paddingBottom,
    }));
  await page.getByRole("button", { name: "History (0)" }).click();
  const empty = page.getByText("No goal history yet.", { exact: true });
  await expect(empty).toBeVisible();
  expect(
    await empty.evaluate((message) => ({
      top: getComputedStyle(message).paddingTop,
      bottom: getComputedStyle(message).paddingBottom,
    })),
  ).toEqual(activePadding);
});

test("goal controls start at the surface without a redundant heading row", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--active");
  const heading = page.getByRole("heading", { name: "My goals", exact: true });
  const action = page.getByRole("button", { name: "Set goal" });
  const content = page.getByText("Train 8 times");
  const tabs = page.getByRole("navigation", { name: "Goal views" });
  const activeTab = tabs.getByRole("button", { name: /Active/ });
  const historyTab = tabs.getByRole("button", { name: /History/ });
  const tabsBox = await tabs.boundingBox();
  const activeBox = await activeTab.boundingBox();
  const historyBox = await historyTab.boundingBox();
  const headerBox = await heading.boundingBox();
  const actionBox = await action.boundingBox();
  const contentBox = await content.boundingBox();
  const section = page.getByRole("region", { name: "My goals", exact: true });
  const sectionBox = await section.boundingBox();
  const surfaceBox = await section.locator(":scope > div").boundingBox();
  if (!headerBox || !actionBox || !contentBox || !tabsBox || !activeBox || !historyBox)
    throw new Error("Expected goal section");
  if (!sectionBox || !surfaceBox) throw new Error("Expected goal surface");
  expect(headerBox.width).toBeLessThanOrEqual(1);
  expect(headerBox.height).toBeLessThanOrEqual(1);
  expect(surfaceBox.y).toBe(sectionBox.y);
  await expect(section.locator(":scope > div")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(
    Math.abs(actionBox.y + actionBox.height / 2 - tabsBox.y - tabsBox.height / 2),
  ).toBeLessThanOrEqual(1);
  expect(actionBox.x).toBeGreaterThanOrEqual(tabsBox.x + tabsBox.width);
  expect(Math.abs(activeBox.y - historyBox.y)).toBeLessThanOrEqual(1);
  expect(actionBox.y).toBeGreaterThanOrEqual(surfaceBox.y);
  expect(contentBox.y).toBeGreaterThan(
    Math.max(actionBox.y + actionBox.height, tabsBox.y + tabsBox.height),
  );
  if (info.project.name.startsWith("mobile")) {
    await page.setViewportSize({ width: 320, height: 812 });
    const narrowAction = await action.boundingBox();
    const narrowActive = await activeTab.boundingBox();
    const narrowHistory = await historyTab.boundingBox();
    const narrowSection = await section.boundingBox();
    if (!narrowAction || !narrowActive || !narrowHistory || !narrowSection)
      throw new Error("Expected narrow goal controls");
    expect(narrowAction.y + narrowAction.height).toBeLessThanOrEqual(narrowActive.y);
    expect(Math.abs(narrowActive.y - narrowHistory.y)).toBeLessThanOrEqual(1);
    expect(
      narrowSection.x + narrowSection.width - narrowAction.x - narrowAction.width,
    ).toBeLessThanOrEqual(1);
  }
});

test("a cross-year goal range splits into right-aligned dates beside the title", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--cross-year-season");
  const title = await page.locator("[data-goal-title]").boundingBox();
  const first = await page.getByText("Dec 1, 2026 –", { exact: true }).boundingBox();
  const second = await page.getByText("Feb 28, 2027", { exact: true }).boundingBox();
  const chip = await page.getByText("Boulder", { exact: true }).boundingBox();
  const bar = await page.getByRole("progressbar").boundingBox();
  if (!title || !first || !second || !chip || !bar)
    throw new Error("Expected goal range and progress");
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(Math.abs(first.x + first.width - second.x - second.width)).toBeLessThanOrEqual(1);
  expect(chip.y).toBeLessThan(title.y + title.height);
  expect(bar.y).toBeGreaterThanOrEqual(title.y + title.height);
  expect(Math.abs(bar.x - title.x)).toBeLessThanOrEqual(1);
  if (info.project.name.startsWith("mobile")) {
    await page.setViewportSize({ width: 320, height: 812 });
    const narrowTitle = await page.locator("[data-goal-title]").boundingBox();
    const narrowBar = await page.getByRole("progressbar").boundingBox();
    if (!narrowTitle || !narrowBar) throw new Error("Expected narrow climb title and progress");
    expect(narrowBar.y).toBeGreaterThanOrEqual(narrowTitle.y + narrowTitle.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  }
});

test("met recurring goals stack period, reset, and end date on the right", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--monthly-target-met");
  await expect(page.getByRole("progressbar")).toBeVisible();
  const period = await page.locator("[data-goal-date]").boundingBox();
  const reset = await page.getByText("Resets Oct 1", { exact: true }).boundingBox();
  const end = await page.getByText("No end date", { exact: true }).boundingBox();
  const title = await page.getByText("Train 1 time every month", { exact: true }).boundingBox();
  const bar = await page.getByRole("progressbar").boundingBox();
  if (!period || !reset || !end || !title || !bar)
    throw new Error("Expected recurring goal date labels and progress");
  expect(reset.y).toBeGreaterThanOrEqual(period.y + period.height);
  expect(end.y).toBeGreaterThanOrEqual(reset.y + reset.height);
  expect(Math.abs(reset.x + reset.width - period.x - period.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(end.x + end.width - period.x - period.width)).toBeLessThanOrEqual(1);
  expect(bar.y).toBeGreaterThanOrEqual(title.y + title.height);
  expect(bar.y).toBeLessThan(end.y + end.height);
  await expect(page.getByRole("button", { name: "See history" })).toHaveCount(0);
});

test("history remains accessible after loading its final page", async ({ page }, info) => {
  const { AxeBuilder } = await import("@axe-core/playwright");
  await openStory(page, info, "patterns-goals--many-completed-goals");
  const more = page.getByRole("button", { name: "Load more", exact: true });
  for (let pageNumber = 0; pageNumber < 6 && (await more.isVisible()); pageNumber += 1) {
    await more.click();
    await expect(page.getByRole("button", { name: "Loading…", exact: true })).toHaveCount(0);
  }
  await expect(more).toHaveCount(0);
  await expect(page.getByText("Showing 20 of 20", { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

for (const story of ["missed-goal", "missed-goal-in-history"]) {
  test(
    `${story} keeps missed status below the date and actions on the right`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, `components-goals-goal-panel--${story}`);
      const date = await page.locator("[data-goal-date]").boundingBox();
      const status = await page.getByText("Not met", { exact: true }).boundingBox();
      if (!date || !status) throw new Error("Expected the missed goal date and status");
      expect(Math.abs(date.x + date.width - status.x - status.width)).toBeLessThanOrEqual(1);
      expect(status.y).toBeGreaterThanOrEqual(date.y + date.height);
      const retry = page.getByRole("button", { name: "Try again", exact: true });
      const archive = page.getByRole("button", { name: "Archive goal", exact: true });
      if (story === "missed-goal") {
        await expect(retry).toBeVisible();
        await expect(retry).toHaveCSS("font-size", "12px");
        await expect(archive).toHaveCSS("font-size", "12px");
        await expect(archive).toBeVisible();
        await expect(archive).toHaveCSS("padding-left", "12px");
        await expect(archive).toHaveCSS("padding-right", "12px");
        const archiveTextRight = await archive.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getBoundingClientRect().right;
        });
        expect(Math.abs(archiveTextRight - status.x - status.width)).toBeLessThanOrEqual(1);
        const bar = await page.getByRole("progressbar").boundingBox();
        const action = await retry.boundingBox();
        const title = await page.getByText("Train 8 times", { exact: true }).boundingBox();
        if (!bar || !action || !title) throw new Error("Expected missed goal controls");
        expect(action.x).toBeGreaterThan(bar.x + bar.width);
        expect(bar.y).toBeGreaterThanOrEqual(title.y + title.height);
        expect(Math.abs(bar.x - title.x)).toBeLessThanOrEqual(1);
      } else {
        await expect(retry).toHaveCount(0);
        await expect(archive).toHaveCount(0);
      }
    },
  );
}

test("ongoing recurring goal shows no end date below the right-side date", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--weekly-consistency");
  const endLabel = page.getByText("No end date", { exact: true });
  await expect(endLabel).toBeVisible();
  const title = await page.getByText("Train 3 times every week", { exact: true }).boundingBox();
  const period = await page.locator("[data-goal-date]").boundingBox();
  const titleTextBottom = await page
    .getByText("Train 3 times every week", { exact: true })
    .evaluate((element) => {
      if (!element.firstChild) throw new Error("Expected goal title text");
      const range = document.createRange();
      range.selectNodeContents(element.firstChild);
      return range.getClientRects()[0].bottom;
    });
  const periodTextBottom = await page.locator("[data-goal-date]").evaluate((element) => {
    if (!element.lastChild) throw new Error("Expected goal period text");
    const range = document.createRange();
    range.selectNodeContents(element.lastChild);
    return range.getClientRects()[0].bottom;
  });
  const date = await endLabel.locator("..").locator(":scope > :first-child").boundingBox();
  const label = await endLabel.boundingBox();
  if (!title || !period || !date || !label) throw new Error("Expected recurring goal date labels");
  expect(Math.abs(titleTextBottom - periodTextBottom)).toBeLessThanOrEqual(1);
  expect(label.y).toBeGreaterThanOrEqual(date.y + date.height);
  expect(Math.abs(label.x + label.width - date.x - date.width)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "End routine" })).toHaveCount(0);
  await page.getByRole("button", { name: /Actions for/ }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "End routine" })).toHaveCount(0);
});
