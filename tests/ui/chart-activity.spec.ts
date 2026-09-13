import { AxeBuilder } from "@axe-core/playwright";
import type { Locator } from "@playwright/test";

import { test, expect, openStory } from "./story";

async function selectMark(plot: Locator, mark: Locator, touch: boolean) {
  const box = await mark.boundingBox();
  const bounds = await plot.boundingBox();
  if (!box || !bounds) throw new Error("Missing chart geometry");
  const position = { x: box.x - bounds.x + box.width / 2, y: box.y - bounds.y + box.height / 2 };
  if (touch) await plot.tap({ position });
  else await plot.click({ position });
}

test("monthly sends and days out show their metrics and unique climb names", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-volume-over-time--monthly");
  const plot = page.getByRole("group", { name: "Monthly sends", exact: true });
  const february = plot.locator("[data-chart-detail]").nth(1);
  if (!info.project.use.hasTouch) {
    await page.mouse.move(1, 1);
    await february.hover();
    const preview = page.getByRole("tooltip");
    await expect(preview).toContainText("Granite Steps");
    await expect(preview).not.toContainText("2026-02-02");
    await expect(preview).not.toContainText("River Stone");
    await preview.hover();
    await expect(preview).toBeVisible();
    await page.screenshot({ path: info.outputPath("monthly-preview.png") });
  }
  await selectMark(plot, february, Boolean(info.project.use.hasTouch));
  await expect(page.getByRole("dialog")).toContainText("River Stone");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Days out", exact: true }).click();
  const days = page.getByRole("group", { name: "Monthly days out", exact: true });
  await selectMark(
    days,
    days.locator("[data-chart-detail]").first(),
    Boolean(info.project.use.hasTouch),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("4 days");
  await expect(dialog.getByRole("rowheader")).toHaveCount(0);
  await expect(dialog.getByText("Cedar Arete", { exact: true })).toHaveCount(1);
  // The gallery already audits this story. Scope the scan to the popup so
  // this test pays only for the state the gallery cannot reach.
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath("days-table.png") });
});

test("flash details show the grade metric and include undated climbs", async ({ page }, info) => {
  await openStory(page, info, "components-charts-flash-rate-by-grade--grades");
  const plot = page.getByRole("group", { name: "Sends and flash percentage by grade" });
  await selectMark(
    plot,
    plot.locator("[data-chart-detail]").nth(1),
    Boolean(info.project.use.hasTouch),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("5 sends");
  await expect(dialog).toContainText("Forgotten Date");
  await expect(dialog).not.toContainText("Undated");
  await expect(dialog.getByRole("columnheader")).toHaveCount(0);
  // The gallery already audits this story. Scope the scan to the popup so
  // this test pays only for the state the gallery cannot reach.
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath("flash-table.png") });
});

test("calendar taps show small previews and open only larger days", async ({ page }, info) => {
  await openStory(page, info, "components-charts-analytics-calendar--single-year");
  const plot = page.getByRole("group", { name: "Daily sessions in 2026" });
  await selectMark(
    plot,
    plot.locator("[data-chart-detail]").nth(1),
    Boolean(info.project.use.hasTouch),
  );
  await expect(page.getByRole("tooltip")).toContainText("Winter Project");
  await expect(page.getByRole("tooltip")).not.toContainText("2026-01-02");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("calendar-preview.png") });
  await page.keyboard.press("Escape");
  await selectMark(
    plot,
    plot.locator("[data-chart-detail]").nth(32),
    Boolean(info.project.use.hasTouch),
  );
  await expect(page.getByRole("dialog")).toContainText("4 sessions");
  await expect(page.getByRole("dialog")).toContainText("River Stone");
  // The gallery already audits this story. Scope the scan to the popup so
  // this test pays only for the state the gallery cannot reach.
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath("calendar-table.png") });
});
