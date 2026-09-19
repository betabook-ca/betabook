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

test("@layout friend, suggestion, and request rows have matching heights", async ({
  page,
}, testInfo) => {
  const heights: number[] = [];
  for (const story of ["default", "requests"]) {
    await openStory(page, testInfo, `components-profile-friends-page--${story}`);
    const rows = page.locator("#storybook-root article");
    const count = await rows.count();
    expect(count).toBe(story === "default" ? 5 : 3);
    for (let index = 0; index < count; index += 1) {
      const bounds = await rows.nth(index).boundingBox();
      if (!bounds) throw new Error("Expected a visible climber row");
      heights.push(bounds.height);
    }
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(Math.max(...heights)).toBeLessThanOrEqual(60);
});
