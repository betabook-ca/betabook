import { expect, openStory, test } from "./story";

test("inline climber results and friend actions fit the page", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "components-profile-friends-page--default");
  await page.getByRole("searchbox", { name: "Find climbers" }).fill("Sam");
  const action = page.getByRole("button", { name: "Add friend: Sam Rivera" });
  await expect(action).toBeVisible();
  const bounds = await action.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Expected a visible friend action");
  const row = action.locator("xpath=ancestor::article");
  const rowBounds = await row.boundingBox();
  if (!rowBounds) throw new Error("Expected a visible climber row");
  expect(Math.abs(bounds.x + bounds.width - rowBounds.x - rowBounds.width)).toBeLessThanOrEqual(1);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
});

test("compact friend menu stays in the viewport", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "components-profile-friend-list--default");
  await page
    .getByRole("button", { name: "Friendship options for Alexandra Montgomery-Castellanos" })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Expected a visible friend menu");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
});
