import { appBaseURL } from "@/tests/ui/app-server";

import { expect } from "./story";
import { test } from "./worker-app";

test(
  "legacy area-name filters stay visible through refinements and can be cleared",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto(`${appBaseURL}/search?mode=climb&areaName=Cedar`);
    const scope = page.getByRole("button", { name: "Area name: Cedar, clear filter" });
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
    await page.goto(`${appBaseURL}/search?mode=all`);
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search Betabook" }).fill("cedar");
    await expect(page).toHaveURL(/name=cedar/);
    await page.getByRole("button", { name: "Climbs", exact: true }).click();
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
  async ({ page }) => {
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
    await page.goto(`${appBaseURL}/search?mode=climb&areaId=3`);
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
    await expect(page.getByRole("button", { name: /^In area: .*clear filter$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Cedar Oregon, Cedar Grove" })).toBeEnabled();
    await page.getByRole("button", { name: /^In area: .*clear filter$/ }).click();
    await expect(page).not.toHaveURL(/areaId=/);
  },
);

test(
  "signed-out search shortcuts navigate to full search without opening a palette",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto(`${appBaseURL}/search?mode=climb&name=cedar`);
    await page.getByRole("link", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(`${appBaseURL}/search`);
    await expect(page.getByRole("searchbox", { name: "Search Betabook" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Search Betabook" })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search Betabook" }).fill("cedar");
    await expect(page).toHaveURL(/name=cedar/);
    const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
    await page.keyboard.press(apple ? "Meta+k" : "Control+k");
    await expect(page).toHaveURL(`${appBaseURL}/search`);
    await expect(page.getByRole("dialog", { name: "Search Betabook" })).toHaveCount(0);
  },
);

test(
  "full search navigation results support opening another tab",
  { tag: ["@behavior", "@app"] },
  async ({ page, context, workerApp: { url, db } }) => {
    // The Worker canonicalizes stale slugs, so use a real popup destination.
    await db.batch([
      db.prepare("INSERT INTO areas (id,name) VALUES (1,'Review area')"),
      db.prepare(
        "INSERT INTO climbs (id,area_id,name,type,grade) VALUES (17,1,'Review climb','boulder',5)",
      ),
    ]);
    await page.goto(new URL("/search?mode=climb", url).href);
    await page.getByRole("searchbox", { name: "Search Betabook" }).fill("review");
    const result = page.getByLabel("Open Review climb, Review area", { exact: true });
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("href", "/climbs/17/review-climb");
    await result.hover();
    const row = result.locator("xpath=ancestor::li[1]");
    await expect(row.getByText("V4", { exact: true })).toBeVisible();
    // The title owns the link. The grade and ascent count stay ordinary text on hover.
    await expect(result.getByText("V4", { exact: true })).toHaveCount(0);
    await expect(row.getByText("0 ascents", { exact: true })).toHaveCSS(
      "text-decoration-line",
      "none",
    );
    const opened = context.waitForEvent("page");
    await result.click({ modifiers: ["ControlOrMeta"] });
    const other = await opened;
    await expect(other).toHaveURL(new URL("/climbs/17/review-climb", url).href);
    await expect(other.getByRole("heading", { name: "Review climb", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/mode=climb/);
    await other.close();
  },
);

test(
  "typing from home retains the same search field across category navigation and Back",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto(appBaseURL);
    const field = page.getByRole("searchbox", { name: "Search Betabook" });
    await expect(field).toBeVisible();
    const original = await field.elementHandle();
    await field.pressSequentially("granite");
    await expect(page).toHaveURL(/\/search\?.*name=granite/);
    await expect(field).toHaveValue("granite");
    await expect(field).toBeFocused();
    await page.getByRole("button", { name: "Climbs", exact: true }).click();
    await expect(page).toHaveURL(/mode=climb/);
    await page.goBack();
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(field).toHaveValue("granite");
    expect(await field.evaluate((input, previous) => input === previous, original)).toBe(true);
    await original?.dispose();
  },
);
