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
  const row = grid.getByRole("row", { name, exact: true });
  const handle = page.getByRole("button", { name: `Drag ${name}`, exact: true });

  // Getting onto the row's drag handle is retried as a unit. The grid owns
  // focus inside itself and a previous drop's session tears down
  // asynchronously, so a single focus-then-Tab can land on another row's
  // handle — and did, for roughly two runs in three before this. Retrying
  // keeps the assertion honest (the handle really is Tab-reachable from the
  // row) without depending on when react-aria finishes.
  await expect(async () => {
    await grid.focus();
    await row.focus();
    await page.keyboard.press("Tab");
    await expect(handle).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 15000 });

  await page.keyboard.press("Enter");
  await expect(page.locator("[data-dragging]")).toHaveCount(1);
  await expect(page.locator('[data-drop-target] [role="button"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator("[data-drop-target]")).toContainText(`Insert before ${before}`);
  await page.keyboard.press("Enter");
  // The drop has to finish before the next call starts, or its indicators are
  // still in the DOM and still taking focus.
  await expect(page.locator("[data-dragging]")).toHaveCount(0);
}

test(
  "calendar years fit the card with bounded previous and next controls",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    const older = page.getByRole("button", { name: "Older calendar year" });
    const newer = page.getByRole("button", { name: "Newer calendar year" });
    const year = page.getByLabel("Displayed calendar year");
    await expect(newer).toBeDisabled();
    await expect(year).toHaveText("2025");
    const leftBounds = await older.boundingBox();
    const yearBounds = await year.boundingBox();
    const rightBounds = await newer.boundingBox();
    if (!leftBounds || !yearBounds || !rightBounds)
      throw new Error("Calendar controls must be visible");
    expect(leftBounds.x + leftBounds.width).toBeLessThanOrEqual(yearBounds.x);
    expect(yearBounds.x + yearBounds.width).toBeLessThanOrEqual(rightBounds.x);
    await older.click();
    await expect(year).toHaveText("2024");
    await expect(older).toBeDisabled();
    await newer.click();
    await expect(year).toHaveText("2025");
  },
);

test(
  "calendar discipline selection fits the card and its menu stays on screen",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--calendar-disciplines");
    const card = page.getByRole("article", { name: "Sending calendar" });
    const filter = card.getByRole("button", { name: "Calendar disciplines: All disciplines" });
    await expect(filter).toBeVisible();
    const cardBounds = await card.boundingBox();
    const filterBounds = await filter.boundingBox();
    if (!cardBounds || !filterBounds) throw new Error("Calendar controls must be visible");
    expect(filterBounds.x).toBeGreaterThanOrEqual(cardBounds.x);
    expect(filterBounds.x + filterBounds.width).toBeLessThanOrEqual(
      cardBounds.x + cardBounds.width,
    );

    await filter.click();
    const menu = page.getByRole("menu", { name: "Calendar disciplines: All disciplines" });
    await expect(menu.getByRole("menuitemcheckbox", { name: "Sport" })).toBeVisible();
    const menuBounds = await menu.boundingBox();
    if (!menuBounds) throw new Error("Calendar discipline menu must be visible");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Viewport must be available");
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width);
  },
);

test("customization supports accessible dragging within both sections", async ({ page }, info) => {
  await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
  const glance = page.getByRole("region", { name: "At a glance", exact: true });
  const charts = page.getByRole("region", { name: "Charts", exact: true });
  await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(glance.getByRole("article").first()).toHaveAccessibleName("Sends");
  await moveEarlier(page, info, "Hardest", "cards", "Sends");
  await expect(glance.getByRole("article").first()).toHaveAccessibleName("Hardest");
  await moveEarlier(page, info, "Grade pyramid", "charts", "Progression");
  await expect(charts.getByRole("article").first()).toHaveAccessibleName("Grade pyramid");
});

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
    await page.mouse.up();
    await expect(grid.getByRole("article").nth(1)).toHaveAccessibleName("Sending days");
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
      name: "Customize dashboard",
      exact: true,
    });
    await expect(title).toBeInViewport();
    await expect(
      page
        .getByRole("group", { name: "Dashboard actions", exact: true })
        .getByRole("button", { name: "Save layout", exact: true }),
    ).toBeVisible();
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
  },
);

test(
  "optional volume and flash charts can be added and remain readable on narrow screens",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    await page.getByRole("button", { name: "Customize charts", exact: true }).click();
    await page.getByRole("button", { name: "Add Volume over time", exact: true }).click();
    await page.getByRole("button", { name: "Add Flash rate by grade", exact: true }).click();
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
    const flash = page.getByRole("article", { name: "Flash rate by grade", exact: true });
    await expect(flash.getByText("Flash rate", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Customize dashboard", exact: true }).click();
  const panel = page.getByRole("region", { name: "Customize dashboard", exact: true });
  const option = panel.getByRole("button", { name: "Add Areas", exact: true });
  expect(await option.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    await panel.evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  await expect(option).toHaveCSS("border-top-width", "0px");
});
