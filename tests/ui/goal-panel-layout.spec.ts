import { expect, test, openStory } from "./story";

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
  const tabsBox = await tabs.boundingBox();
  const headerBox = await heading.boundingBox();
  const actionBox = await action.boundingBox();
  const contentBox = await content.boundingBox();
  const section = page.getByRole("region", { name: "My goals", exact: true });
  const sectionBox = await section.boundingBox();
  const surfaceBox = await section.locator(":scope > div").boundingBox();
  if (!headerBox || !actionBox || !contentBox || !tabsBox) throw new Error("Expected goal section");
  if (!sectionBox || !surfaceBox) throw new Error("Expected goal surface");
  expect(headerBox.width).toBeLessThanOrEqual(1);
  expect(headerBox.height).toBeLessThanOrEqual(1);
  expect(surfaceBox.y).toBe(sectionBox.y);
  expect(
    Math.abs(actionBox.y + actionBox.height / 2 - tabsBox.y - tabsBox.height / 2),
  ).toBeLessThanOrEqual(1);
  expect(actionBox.x).toBeGreaterThanOrEqual(tabsBox.x + tabsBox.width);
  expect(actionBox.y).toBeGreaterThanOrEqual(surfaceBox.y);
  expect(contentBox.y).toBeGreaterThan(actionBox.y + actionBox.height);
});

test("a cross-year goal range wraps below its title on mobile without overlap", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--cross-year-season");
  const title = await page
    .getByText("Send 8 climbs at V4 or harder", { exact: true })
    .boundingBox();
  const date = await page.getByText("Dec 1, 2026 – Feb 28, 2027", { exact: true }).boundingBox();
  if (!title || !date) throw new Error("Expected goal title and seasonal range");
  if (info.project.name.startsWith("mobile"))
    expect(date.y).toBeGreaterThanOrEqual(title.y + title.height);
  else expect(date.x).toBeGreaterThan(title.x + title.width);
});

test("met recurring goals align the reset with the progress row", async ({ page }, info) => {
  await openStory(page, info, "components-goals-goal-panel--monthly-target-met");
  await expect(page.getByRole("progressbar")).toBeVisible();
  const period = await page.locator("[data-goal-date]").boundingBox();
  const reset = await page.getByText("Resets Oct 1", { exact: true }).boundingBox();
  if (!period || !reset) throw new Error("Expected period and reset labels");
  const progress = await page.getByRole("progressbar").boundingBox();
  if (!progress) throw new Error("Expected progress bar");
  expect(
    Math.abs(reset.y + reset.height / 2 - progress.y - progress.height / 2),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(reset.x + reset.width - period.x - period.width)).toBeLessThanOrEqual(1);
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

for (const story of ["missed-goal", "archived-missed-goal", "month-old-missed-goal"]) {
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
        if (!bar || !action) throw new Error("Expected missed goal controls");
        expect(action.x).toBeGreaterThan(bar.x + bar.width);
        expect(Math.abs(bar.y + bar.height / 2 - status.y - status.height / 2)).toBeLessThanOrEqual(
          1,
        );
      } else {
        await expect(retry).toHaveCount(0);
        await expect(archive).toHaveCount(0);
      }
    },
  );
}

test("recurring end-date dialog fits the viewport and exposes the date and save controls", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-panel--monthly-target-met");
  await page.getByRole("button", { name: "End routine" }).click();
  const dialog = page.getByRole("dialog", { name: "End recurring goal" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Missing end-date dialog bounds");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  await expect(page.getByRole("spinbutton", { name: "day, End date" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Save end date" })).toBeInViewport();
  const { AxeBuilder } = await import("@axe-core/playwright");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
