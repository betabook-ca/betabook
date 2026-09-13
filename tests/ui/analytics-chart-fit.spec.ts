import { test, expect, openStory } from "./story";

test(
  "compact charts share a row and the calendar fits without scrolling",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-analytics-dashboard--multiple-years");
    const pyramid = page.getByRole("article", { name: "Grade pyramid", exact: true });
    const breakthroughs = page.getByRole("article", { name: "Breakthroughs", exact: true });
    const a = await pyramid.boundingBox();
    const b = await breakthroughs.boundingBox();
    if (!a || !b) throw new Error("Charts must be rendered");
    if (info.project.name.startsWith("desktop")) {
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      expect(b.x).toBeGreaterThan(a.x);
    } else expect(b.y).toBeGreaterThan(a.y);
    const calendar = page.getByRole("region", { name: "Calendar years", exact: true });
    expect(await calendar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const day = calendar.locator("[data-chart-detail]").nth(100);
    await day.hover();
    await expect(calendar.getByRole("tooltip")).toBeVisible();
    await info.attach("fitted-dashboard", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  },
);

test(
  "a decade of volume fits with readable labels and immediate hover details",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-volume-over-time--long-history");
    const plot = page.getByRole("group", { name: "Monthly sends", exact: true });
    expect(await plot.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const svg = plot.locator("svg");
    await plot.hover({ position: { x: 100, y: 100 } });
    await expect(plot.getByRole("tooltip")).toBeVisible();
    const box = await plot.getByRole("tooltip").boundingBox();
    const chart = await plot.boundingBox();
    if (!box || !chart) throw new Error("Tooltip must appear in the chart");
    expect(box.y).toBeGreaterThanOrEqual(chart.y);
    expect(box.y + box.height).toBeLessThanOrEqual(chart.y + chart.height);
    await svg.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await expect(plot.getByRole("tooltip")).toBeVisible();
    const text = plot.locator("svg text").first();
    expect(await text.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(9);
    await info.attach("volume-line-details", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  },
);
