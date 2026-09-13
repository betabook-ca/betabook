import { AxeBuilder } from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";

import { expect, test, openStory } from "./story";

async function openSearchStory(page: Page, testInfo: TestInfo, name: string) {
  await openStory(page, testInfo, `patterns-search--${name}`);
}

test("quick search selects by keyboard and returns focus on Escape", async ({ page }, testInfo) => {
  await openSearchStory(page, testInfo, "quick-search");
  const trigger = page.getByRole("button", { name: "Search Betabook", exact: true });
  await trigger.click();
  await expect(page.getByRole("option", { name: "Cedar Lee, Climbing partner" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await testInfo.attach("quick-search", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  const input = page.getByRole("combobox", { name: "Search Betabook" });
  await input.fill("cedar crack");
  await expect(
    page.getByRole("option", { name: "Cedar Crack, North Woods / Upper Wall" }),
  ).toHaveAttribute("aria-disabled", "false");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.getByLabel("Selected record")).toHaveAttribute("data-selected-id", "climb-102");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("quick search fits a short narrow viewport and passes accessibility", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await openSearchStory(page, testInfo, "quick-search");
  await page.getByRole("button", { name: "Search Betabook", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.getByRole("option", { name: "Cedar Lee, Climbing partner" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(dialog.getByRole("combobox")).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "View all results for “cedar”" }),
  ).toBeInViewport();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await testInfo.attach("search-320-short", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("full filters and climb picker fit 320 pixels", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openSearchStory(page, testInfo, "full-results");
  await page.getByRole("button", { name: "Climbs", exact: true }).click();
  await page.getByRole("button", { name: "Boulder", exact: true }).click();
  await page.getByRole("button", { name: "Expand filters", exact: true }).click();
  await expect(page.getByRole("button", { name: /Min grade/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Cedar Arete, North Woods / Cedar Grove", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: /Open Cedar Crack/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await testInfo.attach("search-filters-320", {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
  await openSearchStory(page, testInfo, "merge-picker");
  await expect(
    page.getByRole("button", {
      name: "Choose Cedar Arete, North Woods / Cedar Grove",
      exact: true,
    }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await testInfo.attach("search-picker-320", {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
});

test("journey preserves the field focus ring inside the dialog", async ({ page }, testInfo) => {
  await openSearchStory(page, testInfo, "search-journey");
  await page.getByRole("button", { name: "Search Betabook", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Search Betabook" })).toBeFocused();
  const field = page.locator('[data-slot="search-field-group"]');
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("combobox", { name: "Search Betabook" })).toBeFocused();
  await expect(field).toHaveCSS("box-shadow", /0px 0px 0px 2px/);
  const clipping = await field.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clipped: string[] = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      if (
        (style.overflowX !== "visible" &&
          (rect.left - 2 < bounds.left - 0.5 || rect.right + 2 > bounds.right + 0.5)) ||
        (style.overflowY !== "visible" &&
          (rect.top - 2 < bounds.top - 0.5 || rect.bottom + 2 > bounds.bottom + 0.5))
      )
        clipped.push(ancestor.getAttribute("data-slot") ?? ancestor.tagName);
    }
    return clipped;
  });
  expect(clipping).toEqual([]);
  await testInfo.attach("journey-keyboard-focus", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
});

test("opening search with the pointer keeps autofocus without the blue box", async ({
  page,
}, testInfo) => {
  await openSearchStory(page, testInfo, "search-journey");
  const trigger = page.getByRole("button", { name: "Search Betabook", exact: true });
  if (testInfo.project.use.hasTouch) await trigger.tap();
  else await trigger.click();
  const input = page.getByRole("combobox", { name: "Search Betabook" });
  await expect(input).toBeFocused();
  await expect(page.locator('[data-slot="search-field-group"]')).not.toHaveCSS(
    "box-shadow",
    /0px 0px 0px 2px/,
  );
  await testInfo.attach("journey-pointer-focus", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
});
