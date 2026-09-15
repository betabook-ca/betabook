import type { Page } from "@playwright/test";

import { expect, test, openStory } from "./story";

const yearsButton = (page: Page) => page.getByRole("button", { name: /^Years: / });
const yearOption = (page: Page, name: string) =>
  page.getByRole("menuitemcheckbox", { name, exact: true });

async function toggleYears(page: Page, ...years: string[]) {
  await yearsButton(page).click();
  for (const year of years) await yearOption(page, year).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Years" })).toHaveCount(0);
}

async function checkedYears(page: Page) {
  await yearsButton(page).click();
  const checked = await page.getByRole("menuitemcheckbox", { checked: true }).allTextContents();
  await page.keyboard.press("Escape");
  return checked;
}

test("selected years filter every summary and chart, and All years restores the full log", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-analytics-dashboard--all-time");
  const tile = (label: string) => page.getByText(label, { exact: true }).locator("..");
  const value = (label: string) => tile(label).locator(":scope > span").nth(1);
  const progression = page.getByRole("region", { name: "Progression", exact: true });
  const breakthroughs = page.getByRole("region", { name: "Breakthroughs", exact: true });
  await expect(yearsButton(page)).toHaveAccessibleName("Years: All years");

  await toggleYears(page, "2024");
  await expect(yearsButton(page)).toHaveAccessibleName("Years: 2024");
  await expect(value("Sends")).toHaveText("1");
  await expect(value("Best year")).toHaveText("2024");
  await expect(tile("Hardest")).toContainText("First high point");
  await expect(progression).toContainText("Personal best V5");
  await expect(breakthroughs.getByRole("link")).toHaveText(["First high point"]);
  await expect(page.locator('section[aria-label^="Calendar "]')).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Calendar 2024", exact: true })).toBeVisible();

  await toggleYears(page, "2025");
  await expect(page.getByRole("heading", { name: "Activity in 2024–2025" })).toBeVisible();
  expect(await checkedYears(page)).toEqual(["2024", "2025"]);
  await expect(value("Sends")).toHaveText("3");
  await expect(value("Best year")).toHaveText("2025");
  await expect(page.getByText(/Send pyramid:/)).toContainText("V5: 1 send, V3: 1 send, V2: 1 send");
  await expect(page.locator('section[aria-label^="Calendar "]')).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Calendar 2024", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Newer calendar year", exact: true }).click();
  await expect(page.getByRole("region", { name: "Calendar 2025", exact: true })).toBeVisible();
  await expect(progression).not.toContainText("Apr 2026");

  await yearsButton(page).click();
  await yearOption(page, "2025").press("Space");
  await yearOption(page, "2026").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Activity in 2024, 2026" })).toBeVisible();
  await expect(value("Sends")).toHaveText("2");
  await expect(progression).toContainText("Personal best V6");
  await expect(breakthroughs.getByRole("link")).toHaveText(["New high point", "First high point"]);
  await expect(page.getByRole("region", { name: "Calendar 2025", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Calendar 2024", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Newer calendar year", exact: true }).click();
  await expect(page.getByRole("region", { name: "Calendar 2026", exact: true })).toBeVisible();

  await yearsButton(page).click();
  await yearOption(page, "All years").press("Space");
  await page.keyboard.press("Escape");
  await expect(value("Sends")).toHaveText("5");
  await expect(tile("Hardest")).toContainText("An undated ascent");
  await expect(page.locator('section[aria-label^="Calendar "]')).toHaveCount(1);

  await toggleYears(page, "2023");
  await expect(page.getByRole("status").filter({ hasText: "No activity" })).toHaveText(
    "No activity in 2023 for this discipline. Try another year or All years.",
  );
  await expect(tile("Best year")).toHaveCount(0);
  await expect(breakthroughs).toHaveCount(0);
  await expect(progression).toHaveCount(0);
  await toggleYears(page, "2023");
  await expect(yearsButton(page)).toHaveAccessibleName("Years: All years");
  await expect(tile("Hardest")).toContainText("An undated ascent");
});
