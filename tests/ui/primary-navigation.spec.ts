import { expect, openStory, test } from "./story";

for (const [story, role, name] of [
  ["my-journal", "link", "My profile"],
  ["add-climb", "button", "Add"],
  ["add-area", "button", "Add"],
] as const) {
  test(`top navigation highlights its destination on ${story}`, async ({ page }, info) => {
    await openStory(page, info, `components-navigation-primary-page-links--${story}`);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "My profile", exact: true })).toBeVisible();
    const active = nav.getByRole(role, { name, exact: true });
    await expect(active).toHaveCSS("text-decoration-line", "none");
    await expect(active).toHaveCSS("font-weight", "600");
    const inactive = nav.getByRole("link", { name: "Feed", exact: true });
    expect(await active.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      await inactive.evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    await expect(nav.locator("a[aria-current]")).toHaveCount(role === "link" ? 1 : 0);
  });
}

test("the Add menu paints its focus ring only for keyboard focus", async ({ page }, info) => {
  await openStory(page, info, "components-navigation-primary-page-links--my-journal");
  const add = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Add", exact: true });
  // An outline with style none draws nothing, whatever its computed width.
  const paintedRing = () =>
    add.evaluate((element) => {
      const style = getComputedStyle(element);
      const outline =
        style.outlineStyle === "none"
          ? "none"
          : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
      return `${outline} ${style.boxShadow}`;
    });
  const unfocused = await paintedRing();

  await add.click();
  await expect(page.getByRole("menu", { name: "Add" })).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(add).toBeFocused();
  expect(await paintedRing()).toBe(unfocused);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(add).toBeFocused();
  expect(await paintedRing()).not.toBe(unfocused);
});

test(
  "another climber's journal does not mark My profile current",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-navigation-primary-page-links--other-climber");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "My profile", exact: true })).toBeVisible();
    await expect(nav.locator("a[aria-current]")).toHaveCount(0);
  },
);

test("side-menu selection fills the menu row", async ({ page }, info) => {
  await openStory(page, info, "components-navigation-primary-page-links--side-menu");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const active = nav.getByRole("link", { name: "My profile", exact: true });
  await expect(active).toHaveCSS("font-weight", "600");
  const menuBox = await nav.boundingBox();
  const linkBox = await active.boundingBox();
  if (!menuBox || !linkBox) throw new Error("Expected visible menu and active row");
  expect(Math.abs(menuBox.width - linkBox.width)).toBeLessThanOrEqual(1);
});
