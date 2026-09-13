import { AxeBuilder } from "@axe-core/playwright";

import { test, expect, openStory } from "./story";

test("chart preview stays hoverable and the climb table fits the viewport", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-grade-pyramid--preview-boundary");
  const bar = page.getByRole("button", { name: /V2: 4 sends/ });
  if (!info.project.use.hasTouch) {
    await page.mouse.move(1, 1);
    await bar.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.screenshot({ path: info.outputPath("preview.png") });
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
  }
  if (info.project.use.hasTouch) await bar.tap();
  else await bar.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  if (!bounds) throw new Error("Missing dialog bounds");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.width).toBeLessThanOrEqual(400);
  await expect(dialog.getByRole("list", { name: "Climbs" })).toHaveCSS("font-size", "12px");
  await expect(dialog.getByRole("link")).toHaveCount(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  // The gallery already audits this story. Scope the scan to the popup so
  // this test pays only for the state the gallery cannot reach.
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath("climb-table.png") });
});

test("progression point targets and large climb tables are usable on small screens", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-progression-chart--progression");
  const point = page.getByRole("button", { name: /Jun 2026/ });
  await point.scrollIntoViewIfNeeded();
  if (info.project.use.hasTouch) await point.tap();
  else await point.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: info.outputPath("progression-details.png") });
  await openStory(page, info, "components-charts-climb-details--large-group");
  await page.getByRole("button", { name: /60 sends/ }).click();
  const lastRow = page.getByRole("list", { name: "Climbs" }).getByRole("listitem").last();
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeInViewport();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
});

test(
  "dense progression fits without scrolling and keeps every point's target its own",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-progression-chart--dense-history");
    const chart = page.getByRole("region", { name: "boulder grade progression" });
    await expect(chart.getByRole("button")).toHaveCount(72);
    expect(await chart.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    expect(
      await chart.evaluate((node) =>
        Array.from(node.querySelectorAll("button"))
          .filter((button) => {
            const box = button.getBoundingClientRect();
            const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return hit?.closest("button") !== button;
          })
          .map((button) => button.getAttribute("aria-label")),
      ),
    ).toEqual([]);
    const chartBox = await chart.boundingBox();
    if (!chartBox) throw new Error("Missing chart");
    expect(chartBox.height).toBeLessThanOrEqual(220);
    const second = chart.getByRole("button", { name: /Feb 2024/ });
    if (info.project.use.hasTouch) await second.tap();
    else await second.click();
    await expect(page.getByRole("tooltip")).toContainText("Feb 2024");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const targets = (name: string) =>
      page.getByRole("region", { name, exact: true }).evaluate((node) =>
        Array.from(node.querySelectorAll("button"), (button) => {
          const { left, right, top, bottom, width } = button.getBoundingClientRect();
          return { label: button.getAttribute("aria-label"), left, right, top, bottom, width };
        }),
      );
    const distant = await targets("sport grade progression");
    expect(distant).toHaveLength(18);
    expect(distant.filter((target) => target.width < 23.5).map((target) => target.label)).toEqual(
      [],
    );
    const narrow = await targets("trad grade progression");
    expect(narrow).toHaveLength(12);
    expect(
      narrow.flatMap((a, i) =>
        narrow
          .slice(i + 1)
          .filter(
            (b) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5,
          )
          .map((b) => `${a.label} / ${b.label}`),
      ),
    ).toEqual([]);
  },
);

test("complete three-climb previews work on touch without offering a table", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-grade-pyramid--preview-boundary");
  const bar = page.getByRole("button", { name: /V3: 3 sends/ });
  if (info.project.use.hasTouch) await bar.tap();
  else {
    await page.mouse.move(1, 1);
    await bar.hover();
  }
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("Moss Garden");
  await expect(tooltip).not.toContainText("view all climbs");
  await expect(bar).not.toHaveAttribute("aria-haspopup");
  await bar.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tooltip).toBeVisible();
  await page.screenshot({ path: info.outputPath("complete-preview.png") });
});

test(
  "detail popups fit their content and clamp long names to the screen",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-climb-details--compact-popup");
    const compact = await page.getByRole("dialog").boundingBox();
    if (!compact) throw new Error("Missing compact popup");
    expect(compact.width).toBeLessThan(300);
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Climb", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveText("");
    await page.screenshot({ path: info.outputPath("compact-popup.png") });
    await openStory(page, info, "components-charts-climb-details--large-group");
    await page.getByRole("button", { name: /60 sends/ }).click();
    const large = await page.getByRole("dialog").boundingBox();
    if (!large) throw new Error("Missing long-list popup");
    expect(large.width).toBeGreaterThan(compact.width);
    expect(large.x).toBeGreaterThanOrEqual(0);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Missing viewport");
    expect(large.x + large.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: info.outputPath("long-popup.png") });
  },
);
