import { expect, openStory, test } from "./story";

test("example navigation stays outside the scrolling lesson and switches cleanly at narrow widths", async ({
  page,
}, info) => {
  await openStory(page, info, "components-tutorials-navigation-preview--logbook");
  const sidebar = page.getByRole("complementary", { name: "Example sidebar" });
  const mobile = page.getByRole("navigation", { name: "Example mobile navigation" });
  const content = page.locator("[data-tour-scroll]");
  const frame = content.locator("..");
  const bounds = await frame.boundingBox();
  const contentBounds = await content.boundingBox();
  if (!bounds || !contentBounds) throw new Error("Missing preview geometry");
  if (info.project.name.startsWith("mobile")) {
    await expect(sidebar).toBeHidden();
    await expect(mobile).toBeVisible();
    const footer = await mobile.boundingBox();
    if (!footer) throw new Error("Missing example mobile tabs");
    expect(contentBounds.y + contentBounds.height).toBeLessThanOrEqual(footer.y + 1);
    expect(footer.y + footer.height).toBeCloseTo(bounds.y + bounds.height, 0);
    await page.getByRole("button", { name: "Open example menu" }).click();
    const menu = page.getByRole("dialog", { name: "Example menu" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link")).toHaveCount(1);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(menu).toBeHidden();
    await expect(sidebar).toBeVisible();
    await expect(mobile).toBeHidden();
  } else {
    await expect(sidebar).toHaveCSS("width", "64px");
    await expect(mobile).toBeHidden();
    await sidebar.getByRole("button", { name: /example sidebar/ }).click();
    await expect(sidebar).toHaveCSS("width", "224px");
    const after = await content.boundingBox();
    if (!after) throw new Error("Missing expanded preview");
    expect(after.x - contentBounds.x).toBe(160);
    expect(after.width).toBe(contentBounds.width - 160);
  }
});

for (const story of [
  "logbook",
  "sends",
  "progress",
  "analytics",
  "community",
  "feed",
  "search",
  "you",
  "updates",
]) {
  test(`tutorial ${story} fits with visible primary navigation`, async ({ page }, info) => {
    await openStory(page, info, `components-tutorials-navigation-preview--${story}`);
    const nav = page.getByRole("navigation", {
      name: info.project.name.startsWith("mobile")
        ? "Example mobile navigation"
        : "Example desktop navigation",
    });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(info.project.name.startsWith("mobile") ? 3 : 4);
    const content = page.locator("[data-tour-scroll]");
    const dimensions = await content.evaluate((el) => ({
      width: el.clientWidth,
      content: el.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  });
}
