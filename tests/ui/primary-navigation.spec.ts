import { expect, openStory, test } from "./story";

for (const [story, label] of [
  ["profile", "Profile"],
  ["feed", "Feed"],
  ["friend-requests", "Friends, 12 pending friend requests"],
]) {
  test(`tab bar highlights its destination on ${story}`, async ({ page }, info) => {
    await openStory(page, info, `components-navigation-tab-bar--${story}`);
    const nav = page.getByRole("navigation", { name: "Primary" });
    const active = nav.getByRole("link", { name: label, exact: true });
    await expect(active).toHaveCSS("text-decoration-line", "none");
    await expect(active).toHaveCSS("font-weight", "600");
    const inactive = nav.locator("a:not([aria-current])").first();
    expect(await active.evaluate((element) => getComputedStyle(element).color)).not.toBe(
      await inactive.evaluate((element) => getComputedStyle(element).color),
    );
    await expect(nav.locator("a[aria-current]")).toHaveCount(1);
  });
}

test(
  "tab bar splits its width into even, touch-sized tabs",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-navigation-tab-bar--friend-requests");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const tabs = await nav.getByRole("link").all();
    expect(tabs).toHaveLength(3);
    const widths: number[] = [];
    for (const tab of tabs) {
      const box = await tab.boundingBox();
      if (!box) throw new Error("Expected visible tabs");
      expect(box.height).toBeGreaterThanOrEqual(44);
      widths.push(box.width);
    }
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const navBox = await nav.boundingBox();
    const friends = await nav.locator("a[href='/friends']").boundingBox();
    const count = await nav.locator("a[href='/friends'] [aria-hidden='true']").last().boundingBox();
    if (!navBox || !friends || !count) throw new Error("Expected the Friends request count");
    expect(count.y).toBeGreaterThanOrEqual(navBox.y);
    expect(count.x + count.width).toBeLessThanOrEqual(friends.x + friends.width);
  },
);

test("another climber's profile marks no tab", { tag: "@behavior" }, async ({ page }, info) => {
  await openStory(page, info, "components-navigation-tab-bar--other-climber");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await expect(nav.locator("a[aria-current]")).toHaveCount(0);
});

test("menu selection fills the menu row", async ({ page }, info) => {
  await openStory(page, info, "components-navigation-app-menu--profile");
  const nav = page.getByRole("navigation", { name: "Menu" });
  const active = nav.getByRole("link", { name: /Alex Morgan/ });
  await expect(active).toHaveAttribute("aria-current", "location");
  await expect(active).toHaveCSS("font-weight", "600");
  const activeBox = await active.boundingBox();
  const feedBox = await nav.getByRole("link", { name: "Feed", exact: true }).boundingBox();
  if (!activeBox || !feedBox) throw new Error("Expected visible menu rows");
  expect(Math.abs(activeBox.width - feedBox.width)).toBeLessThanOrEqual(1);
  expect(await active.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    await nav
      .getByRole("link", { name: "Feed", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  );
});
