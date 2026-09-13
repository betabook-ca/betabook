import { expect, openStory, test } from "./story";

for (const [story, label] of [
  ["my-journal", "My profile"],
  ["add-climb", "Add a climb or area"],
  ["add-area", "Add a climb or area"],
]) {
  test(`top navigation highlights its destination on ${story}`, async ({ page }, info) => {
    await openStory(page, info, `components-navigation-primary-page-links--${story}`);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "My profile", exact: true })).toBeVisible();
    const active = nav.getByRole("link", { name: label, exact: true });
    await expect(active).toHaveCSS("text-decoration-line", "none");
    await expect(active).toHaveCSS("font-weight", "600");
    const inactive = nav.locator("a:not([aria-current])").first();
    expect(await active.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      await inactive.evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    await expect(nav.locator("a[aria-current]")).toHaveCount(1);
  });
}

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
