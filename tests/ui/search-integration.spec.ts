import { appBaseURL } from "@/tests/ui/app-server";

import { test, expect } from "./story";

test(
  "legacy area-name filters stay visible through refinements and can be cleared",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto(`${appBaseURL}/?mode=climb&areaName=Cedar`);
    const scope = page.getByRole("button", { name: "Clear area name Cedar" });
    await expect(scope).toBeVisible();
    await page.getByRole("button", { name: /Sort by/ }).click();
    await expect(page.getByRole("option")).toHaveText(["Name", "Grade", "Rating", "Ascents"]);
    await page.getByRole("option", { name: "Grade" }).click();
    await expect(page).toHaveURL(/sort=grade_desc/);
    await expect(page).toHaveURL(/areaName=Cedar/);
    await expect(scope).toBeVisible();
    await scope.click();
    await expect(page).not.toHaveURL(/areaName=/);
    await expect(scope).toHaveCount(0);
  },
);

test(
  "app search journey preserves query and category in the full-results URL",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto(`${appBaseURL}/?mode=all`);
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Search Betabook" });
    const input = dialog.getByRole("combobox", { name: "Search Betabook" });
    await input.fill("cedar");
    await dialog.getByRole("button", { name: "Climbs", exact: true }).click();
    await dialog.getByRole("button", { name: /View all results/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/mode=climb/);
    await expect(page).toHaveURL(/name=cedar/);
    await expect(page.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("cedar");
    await expect(page.getByRole("button", { name: "Climbs", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
);

test(
  "app full search restores an explicit area ID and query with browser history",
  { tag: ["@behavior", "@app"] },
  async ({ page }, testInfo) => {
    await page.route("**/api/public/search/climbs?**", async (route) => {
      const id = new URL(route.request().url()).searchParams.get("areaId");
      await route.fulfill({
        json: {
          climbs: [
            {
              id: id === "3" ? 31 : 21,
              areaId: Number(id ?? 2),
              areaName: "Cedar Grove",
              name: id === "3" ? "Cedar Oregon" : "Cedar California",
              type: "boulder",
              grade: 5,
              avgRating: 4,
              sendCount: 6,
            },
          ],
          hasNextPage: false,
          areaBreadcrumbs: {},
          sendStats: {},
        },
      });
    });
    await page.goto(`${appBaseURL}/?mode=climb&areaId=3`);
    await page.getByRole("searchbox", { name: "Search Betabook" }).fill("cedar");
    await expect(page.getByRole("combobox", { name: "In area" })).toHaveCount(0);
    await expect(page).toHaveURL(/areaId=3/);
    await expect(page.getByRole("link", { name: "Open Cedar Oregon, Cedar Grove" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Cedar California/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Areas", exact: true }).click();
    await expect(page).toHaveURL(/mode=area/);
    await page.goBack();
    await expect(page).toHaveURL(/mode=climb/);
    await expect(page).toHaveURL(/areaId=3/);
    await expect(page.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("cedar");
    await expect(page.getByRole("button", { name: /^Clear area / })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Cedar Oregon, Cedar Grove" })).toBeEnabled();
    await testInfo.attach("integrated-app-search", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: /^Clear area / }).click();
    await expect(page).not.toHaveURL(/areaId=/);
  },
);

test(
  "a new quick search session starts without previous query or category",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto(`${appBaseURL}/?mode=all`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Search Betabook" });
    const input = dialog.getByRole("combobox", { name: "Search Betabook" });
    await input.fill("previous query");
    await dialog.getByRole("button", { name: "Climbs", exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(input).toHaveValue("");
    await expect(dialog.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog.getByRole("option")).toHaveCount(0);
  },
);

test(
  "full search navigation results support opening another tab",
  { tag: ["@behavior", "@app"] },
  async ({ page, context }) => {
    await page.route("**/api/public/search/climbs?**", (route) =>
      route.fulfill({
        json: {
          climbs: [
            {
              id: 17,
              areaId: 1,
              areaName: "Review area",
              name: "Review climb",
              type: "boulder",
              grade: 5,
              avgRating: null,
              sendCount: 0,
            },
          ],
          hasNextPage: false,
          areaBreadcrumbs: {},
          sendStats: {},
        },
      }),
    );
    await page.goto(`${appBaseURL}/?mode=climb`);
    await page.getByRole("searchbox", { name: "Search Betabook" }).fill("review");
    const result = page.getByLabel("Open Review climb, Review area", { exact: true });
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("href", "/climbs/17/review-climb");
    const opened = context.waitForEvent("page");
    await result.click({ modifiers: ["ControlOrMeta"] });
    const other = await opened;
    await other.waitForURL(/\/climbs\/17\/review-climb/);
    await expect(page).toHaveURL(/mode=climb/);
    await other.close();
  },
);
