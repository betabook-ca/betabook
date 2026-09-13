import type { Page, TestInfo } from "@playwright/test";

import { expect, test, openStory } from "./story";

async function openDates(page: Page, testInfo: TestInfo, story = "any") {
  await openStory(page, testInfo, `components-filters-date-filter--${story}`);
}

async function choose(page: Page, option: string) {
  await page.getByRole("button", { name: /Dates$/ }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test(
  "custom dates accept typing, validate order, and support a single day",
  { tag: "@behavior" },
  async ({ page }, testInfo) => {
    await openDates(page, testInfo);
    await choose(page, "Custom dates");
    const dates = page.getByRole("status", { name: "Selected dates" });
    const segments = page.getByRole("spinbutton");
    await segments.nth(0).fill("6");
    await segments.nth(1).fill("1");
    await expect(dates).toHaveText("{}");
    await segments.nth(2).fill("2025");
    await segments.nth(3).fill("8");
    await segments.nth(4).fill("31");
    await segments.nth(5).fill("2025");

    await expect(dates).toHaveText('{"dateFrom":"2025-06-01","dateTo":"2025-08-31"}');
    await segments.nth(5).fill("2024");
    await expect(page.getByRole("alert")).toHaveText("End date must be on or after start date.");
    await expect(dates).toHaveText('{"dateFrom":"2025-06-01","dateTo":"2025-08-31"}');
    await segments.nth(3).fill("6");
    await segments.nth(4).fill("1");
    await segments.nth(5).fill("2025");
    await expect(dates).toHaveText('{"date":"2025-06-01"}');
  },
);

test(
  "custom date calendars select both endpoints",
  { tag: "@behavior" },
  async ({ page }, testInfo) => {
    await openDates(page, testInfo, "date-range");
    await page.getByRole("button", { name: "Calendar Start date" }).click();
    await page.getByRole("button", { name: "Monday, June 2, 2025", exact: true }).click();
    await page.getByRole("button", { name: "Calendar End date (optional)" }).click();
    await page.getByRole("button", { name: "Saturday, August 30, 2025", exact: true }).click();
    await expect(page.getByRole("status", { name: "Selected dates" })).toHaveText(
      '{"dateFrom":"2025-06-02","dateTo":"2025-08-30"}',
    );
  },
);
