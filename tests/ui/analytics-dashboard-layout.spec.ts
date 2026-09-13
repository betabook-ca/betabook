import { AxeBuilder } from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";

import { expect, openStory, test } from "./story";

async function moveEarlier(
  page: Page,
  info: TestInfo,
  name: string,
  section: "cards" | "charts",
  before: string,
) {
  if (info.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: `Move ${name} earlier`, exact: true }).click();
    return;
  }
  const grid = page.getByRole("grid", { name: `Reorder ${section}`, exact: true });
  await grid.focus();
  await grid.getByRole("row", { name, exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: `Drag ${name}`, exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-dragging]")).toHaveCount(1);
  await expect(page.locator('[data-drop-target] [role="button"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator("[data-drop-target]")).toContainText(`Insert before ${before}`);
  await page.keyboard.press("Enter");
}

test(
  "calendar years fit the card with bounded previous and next controls",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    const older = page.getByRole("button", { name: "Older calendar year" });
    const newer = page.getByRole("button", { name: "Newer calendar year" });
    const year = page.getByLabel("Displayed calendar year");
    await expect(older).toBeDisabled();
    await expect(year).toHaveText("2024");
    const leftBounds = await older.boundingBox();
    const yearBounds = await year.boundingBox();
    const rightBounds = await newer.boundingBox();
    if (!leftBounds || !yearBounds || !rightBounds)
      throw new Error("Calendar controls must be visible");
    expect(leftBounds.x + leftBounds.width).toBeLessThanOrEqual(yearBounds.x);
    expect(yearBounds.x + yearBounds.width).toBeLessThanOrEqual(rightBounds.x);
    await newer.click();
    await expect(year).toHaveText("2025");
    await expect(newer).toBeDisabled();
    await older.click();
    await expect(year).toHaveText("2024");
    await info.attach("calendar-carousel", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  },
);

test("customization reorders and hides cards and charts within their sections", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
  const glance = page.getByRole("region", { name: "At a glance", exact: true });
  const charts = page.getByRole("region", { name: "Charts", exact: true });
  await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await info.attach("dashboard-editor", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await expect(glance.getByRole("article").first()).toHaveAccessibleName("Sends");
  await moveEarlier(page, info, "Hardest", "cards", "Sends");
  await expect(glance.getByRole("article").first()).toHaveAccessibleName("Hardest");
  await page.getByRole("button", { name: "Hide First try", exact: true }).click();
  await expect(glance.getByRole("article", { name: "First try", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add First try", exact: true }).click();
  await expect(glance.getByRole("article", { name: "First try", exact: true })).toBeVisible();
  await moveEarlier(page, info, "Grade pyramid", "charts", "Progression");
  await expect(charts.getByRole("article").first()).toHaveAccessibleName("Grade pyramid");
  await page.getByRole("button", { name: "Hide Breakthroughs", exact: true }).click();
  await expect(page.getByRole("region", { name: "Breakthroughs", exact: true })).toHaveCount(0);
  await page
    .getByRole("group", { name: "Dashboard actions", exact: true })
    .getByRole("button", { name: "Save layout", exact: true })
    .click();
  await expect(glance.getByRole("article").first()).toHaveAccessibleName("Hardest");
  await expect(charts.getByRole("article").first()).toHaveAccessibleName("Grade pyramid");
  await info.attach("custom-dashboard", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Restore default layout", exact: true }).click();
  await expect(glance.getByRole("article").first()).toHaveAccessibleName("Sends");
  await expect(charts.getByRole("article").first()).toHaveAccessibleName("Progression");
  await expect(page.getByRole("region", { name: "Breakthroughs", exact: true })).toBeVisible();
});

test(
  "saved account layout is displayed on entry and preserved through year changes",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--saved-layout");
    const glance = page.getByRole("region", { name: "At a glance", exact: true });
    await expect(glance.getByRole("article").first()).toHaveAccessibleName("Hardest");
    await expect(glance.getByRole("article", { name: "Areas", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Years: / }).click();
    await page.getByRole("menuitemcheckbox", { name: "2026", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Activity in 2024–2026", exact: true }),
    ).toBeVisible();
    await expect(glance.getByRole("article").first()).toHaveAccessibleName("Hardest");
    await expect(glance.getByRole("article", { name: "Areas", exact: true })).toHaveCount(0);
  },
);

test(
  "keyboard drag reorders a card without crossing into charts",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    const glance = page.getByRole("region", { name: "At a glance", exact: true });
    await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
    const grid = page.getByRole("grid", { name: "Reorder cards", exact: true });
    await grid.focus();
    await expect(grid.getByRole("row", { name: "Sends", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(grid.getByRole("row", { name: "Hardest", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Drag Hardest", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-dragging]")).toHaveCount(1);
    await expect(page.locator('[data-drop-target] [role="button"]')).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator("[data-drop-target]")).toContainText("Insert before Sends");
    await page.keyboard.press("Enter");
    await expect(glance.getByRole("article").first()).toHaveAccessibleName("Hardest");
    await expect(
      page.getByRole("region", { name: "Charts", exact: true }).getByRole("article").first(),
    ).toHaveAccessibleName("Progression");
  },
);

test(
  "failed account save keeps changes editable and cancel restores the saved layout",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--save-failure");
    await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Hide First try", exact: true }).click();
    await page
      .getByRole("group", { name: "Dashboard actions", exact: true })
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Your layout couldn’t be saved. Please try again.",
    );
    await expect(
      page
        .getByRole("group", { name: "Dashboard actions", exact: true })
        .getByRole("button", { name: "Save layout", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("article", { name: "First try", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("article", { name: "First try", exact: true })).toBeVisible();
  },
);

test(
  "another profile has no customization controls",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--another-profile");
    await expect(page.getByRole("heading", { name: "At a glance", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Customize dashboard", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Move |^Hide |^Drag / })).toHaveCount(0);
  },
);

test(
  "move arrows are available only on small screens",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
    const arrow = page.getByRole("button", { name: "Move Hardest earlier", exact: true });
    if (info.project.name.startsWith("mobile")) await expect(arrow).toBeVisible();
    else await expect(arrow).toBeHidden();
  },
);

test(
  "dragging shows an insertion marker at the destination card",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
    const grid = page.getByRole("grid", { name: "Reorder cards", exact: true });
    await grid.scrollIntoViewIfNeeded();
    const source = await page
      .getByRole("button", { name: "Drag Sending days", exact: true })
      .boundingBox();
    const destination = await grid.getByRole("row", { name: "Hardest", exact: true }).boundingBox();
    if (!source || !destination) throw new Error("Drag cards must be visible");
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 15, source.y + source.height / 2, {
      steps: 4,
    });
    await page.mouse.move(destination.x + 3, destination.y + destination.height / 2, { steps: 10 });
    const marker = page
      .locator("[data-drop-target]")
      .getByText("Insert before Hardest", { exact: true });
    await expect(marker).toBeVisible();
    const markerBounds = await marker.boundingBox();
    if (!markerBounds) throw new Error("Insertion marker must be visible");
    expect(Math.abs(markerBounds.x - destination.x)).toBeLessThan(16);
    await info.attach("drag-destination", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.mouse.up();
    await expect(grid.getByRole("article").nth(1)).toHaveAccessibleName("Sending days");
  },
);

test(
  "addable cards and charts are separate from dashboard actions",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--saved-layout");
    await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Hide Breakthroughs", exact: true }).click();
    await expect(
      page
        .getByRole("group", { name: "At a glance", exact: true })
        .getByRole("button", { name: "Add Areas", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Charts", exact: true })
        .getByRole("button", { name: "Add Breakthroughs", exact: true }),
    ).toBeVisible();
    const actions = page.getByRole("group", { name: "Dashboard actions", exact: true });
    await expect(actions.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await expect(
      actions.getByRole("button", { name: "Restore default layout", exact: true }),
    ).toBeVisible();
    await expect(actions.getByRole("button", { name: /^Add / })).toHaveCount(0);
    await info.attach("add-back-controls", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "Add Areas", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add Areas", exact: true })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Areas", exact: true })).toBeVisible();
  },
);

test(
  "Customize placeholders fit their sections and bring the layout editor into view",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--hidden-chart");
    const cards = page.getByRole("region", { name: "At a glance", exact: true });
    const placeholder = cards.getByRole("button", { name: "Customize cards", exact: true });
    const stat = await cards.getByRole("article").first().boundingBox();
    const blank = await placeholder.boundingBox();
    if (!stat || !blank) throw new Error("Card and placeholder must have bounds");
    expect(Math.abs(stat.width - blank.width)).toBeLessThan(1);
    await page.getByRole("button", { name: "Customize charts", exact: true }).click();
    const title = page.getByRole("heading", {
      name: "Customize your analytics dashboard",
      exact: true,
    });
    await expect(title).toBeInViewport();
    await expect(
      page
        .getByRole("group", { name: "Dashboard actions", exact: true })
        .getByRole("button", { name: "Save layout", exact: true }),
    ).toBeVisible();
    await info.attach("customize-panel", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  },
);

test(
  "analytics filters follow the activity heading with expansion beside the years",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--filters");
    const heading = await page
      .getByRole("heading", { name: "All-time activity", exact: true })
      .boundingBox();
    const discipline = await page
      .getByRole("navigation", { name: "Discipline", exact: true })
      .boundingBox();
    const years = await page.getByRole("button", { name: /^Years: / }).boundingBox();
    const expand = page.getByRole("button", { name: "Expand filters", exact: true });
    const trigger = await expand.boundingBox();
    if (!heading || !discipline || !years || !trigger)
      throw new Error("Filter controls must have bounds");
    expect(discipline.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(years.y).toBeGreaterThanOrEqual(discipline.y + discipline.height);
    expect(trigger.x).toBeGreaterThanOrEqual(years.x + years.width);
    expect(Math.abs(trigger.y + trigger.height / 2 - years.y - years.height / 2)).toBeLessThan(1);
    const customize = await page
      .getByRole("button", { name: "Customize dashboard", exact: true })
      .boundingBox();
    if (!customize) throw new Error("Missing Customize");
    expect(
      Math.abs(customize.y + customize.height / 2 - heading.y - heading.height / 2),
    ).toBeLessThan(8);

    await expand.click();
    await expect(page.getByRole("region", { name: "Filter options", exact: true })).toBeVisible();
    await info.attach("analytics-filter-placement", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  },
);

test(
  "optional volume and flash charts can be added and remain readable on narrow screens",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    await page.getByRole("button", { name: "Customize charts", exact: true }).click();
    await page.getByRole("button", { name: "Add Volume over time", exact: true }).click();
    await page.getByRole("button", { name: "Add First-try rate by grade", exact: true }).click();
    await page
      .getByRole("group", { name: "Dashboard actions", exact: true })
      .getByRole("button", { name: "Save layout", exact: true })
      .click();
    const volume = page.getByRole("article", { name: "Volume over time", exact: true });
    await volume.getByRole("button", { name: "Days out", exact: true }).click();
    const plot = volume.getByRole("group", { name: "Monthly days out", exact: true });
    await expect(plot).toBeVisible();
    const bounds = await plot.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Volume plot and viewport must have bounds");
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await info.attach("optional-volume-chart", {
      body: await volume.screenshot(),
      contentType: "image/png",
    });
    const flash = page.getByRole("article", { name: "First-try rate by grade", exact: true });
    await expect(flash.getByText("First-try rate", { exact: true })).toBeVisible();
    await info.attach("optional-flash-chart", {
      body: await flash.screenshot(),
      contentType: "image/png",
    });
  },
);

test(
  "floating save appears past the editor and saves the reordered layout",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
    const mainSave = page
      .getByRole("group", { name: "Dashboard actions", exact: true })
      .getByRole("button", { name: "Save layout", exact: true });
    const reminder = page.getByRole("group", { name: "Save layout reminder", exact: true });
    await mainSave.scrollIntoViewIfNeeded();
    await expect(reminder).toHaveCount(0);
    await page
      .getByRole("button", { name: "Hide Sending calendar", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(reminder).toBeVisible();
    const bounds = await reminder.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Floating action must have visible bounds");
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await mainSave.scrollIntoViewIfNeeded();
    await expect(reminder).toHaveCount(0);
    await page.getByRole("button", { name: "Hide Sending calendar", exact: true }).click();
    await page
      .getByRole("article", { name: "Grade pyramid", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(reminder).toBeVisible();
    await info.attach("floating-save", { body: await page.screenshot(), contentType: "image/png" });
    await reminder.getByRole("button", { name: "Save layout", exact: true }).click();
    await expect(reminder).toHaveCount(0);
    await expect(page.getByRole("grid", { name: "Reorder charts", exact: true })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Sending calendar", exact: true })).toHaveCount(
      0,
    );
  },
);

test("laptop fits six stat slots and customization options contrast with their panel", async ({
  page,
}, info) => {
  const laptop = info.project.name.startsWith("desktop");
  if (laptop) await page.setViewportSize({ width: 1280, height: 800 });
  await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
  const cards = page.getByRole("region", { name: "At a glance", exact: true });
  const first = await cards.getByRole("article").first().boundingBox();
  const last = await cards
    .getByRole("button", { name: "Customize cards", exact: true })
    .boundingBox();
  if (!first || !last) throw new Error("Default cards must be visible");
  if (laptop) expect(Math.abs(first.y - last.y)).toBeLessThan(1);
  else expect(last.y).toBeGreaterThan(first.y);
  await info.attach("six-stat-slots", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
  const panel = page.getByLabel("Customize your analytics dashboard", { exact: true });
  const option = panel.getByRole("button", { name: "Add Areas", exact: true });
  expect(await option.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    await panel.evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  await expect(option).toHaveCSS("border-top-width", "0px");
  await info.attach("contrasting-customize-options", {
    body: await panel.screenshot(),
    contentType: "image/png",
  });
});
