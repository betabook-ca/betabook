import { expect, openStory, test } from "./story";

for (const [story, title, labels] of [
  ["logbook", "Logbook", ["Journal", "Sends"]],
  ["sends", "Logbook", ["Journal", "Sends"]],
  ["progress", "Progress", ["Goals", "Open Projects", "Analytics"]],
  ["community", "Community", ["Feed", "Friends"]],
  ["friends", "Community", ["Feed", "Friends"]],
] as const) {
  test(`workspace ${story} leads with prominent subpages and compact spacing`, async ({
    page,
  }, info) => {
    await openStory(page, info, `components-navigation-workspace--${story}`);
    const workspace = page.getByRole("region", { name: `${title} workspace` });
    const heading = await workspace.getByRole("heading", { level: 1 }).boundingBox();
    const frame = await workspace.boundingBox();
    const nav = workspace.getByRole("navigation", { name: `${title} sections` });
    const navBox = await nav.boundingBox();
    const content = await workspace.locator(":scope > :last-child").boundingBox();
    if (!heading || !frame || !navBox || !content) throw new Error("Missing workspace frame");
    expect(heading.width).toBeLessThanOrEqual(1);
    expect(heading.height).toBeLessThanOrEqual(1);
    expect(navBox.y).toBe(frame.y);
    expect(content.y - navBox.y - navBox.height).toBe(16);
    expect(navBox.x).toBe(frame.x);
    expect(content.x).toBe(frame.x);
    expect(await nav.getByRole("link").allTextContents()).toEqual([...labels]);
    for (const link of await nav.getByRole("link").all()) {
      const box = await link.boundingBox();
      if (!box) throw new Error("Missing workspace tab");
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(link).toHaveCSS("font-size", "20px");
    }
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await current.evaluate((node) => getComputedStyle(node, "::after").height)).toBe("2px");
    if (story === "progress") {
      await page.setViewportSize({ width: 320, height: 812 });
      const widths = await nav.evaluate((node) => ({
        content: node.scrollWidth,
        available: node.clientWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.available);
    }
  });
}
