import { expect, test, openStory } from "./story";

test("sentence dates fit the popup and switching back to a preset keeps the custom range", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-form--seasonal-goal");
  for (const word of ["between", "and", "Custom date range"]) {
    await expect(page.getByText(word, { exact: true })).toHaveCSS("font-size", "14px");
  }
  await expect(page.getByRole("spinbutton", { name: "month, Start date", exact: true })).toHaveCSS(
    "font-size",
    "14px",
  );
  const dates = page.locator(".date-input-group");
  const start = await dates.nth(0).boundingBox();
  const end = await dates.nth(1).boundingBox();
  if (!start || !end) throw new Error("Expected the two custom date controls");
  expect(start.height).toBe(end.height);
  if (info.project.name.startsWith("desktop")) expect(start.y).toBe(end.y);
  else expect(end.y).toBeGreaterThan(start.y);
  await expect(page.getByText("Start date", { exact: true })).toHaveCSS("position", "absolute");
  await expect(page.getByText("End date", { exact: true })).toHaveCSS("position", "absolute");
  await page.getByRole("button", { name: "Timeframe" }).click();
  await page.getByRole("option", { name: "this year", exact: true }).click();
  await expect(dates).toHaveCount(0);
  await expect(page.getByText("by the end of", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Timeframe" }).click();
  await page.getByRole("option", { name: "Custom date range", exact: true }).click();
  await expect(dates).toHaveCount(2);
  await expect(
    page.getByRole("spinbutton", { name: "month, End date", exact: true }),
  ).toHaveAttribute("aria-valuenow", "11");
});

for (const width of [320, 375, 480, 640, 768]) {
  test(`custom-range label remains fully visible on one line at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openStory(page, info, "components-goals-goal-form--seasonal-goal");
    const control = page.getByRole("button", { name: "Timeframe" });
    const label = control.getByText("Custom date range", { exact: true });
    await expect(label).toHaveCSS("white-space", "nowrap");
    const measured = await label.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        text: range.getBoundingClientRect().width,
        available: element.getBoundingClientRect().width,
      };
    });
    expect(measured.text).toBeLessThanOrEqual(measured.available + 1);
    const dates = page.locator(".date-input-group");
    for (const [index, word] of ["between", "and"].entries()) {
      const text = await page.getByText(word, { exact: true }).boundingBox();
      const field = await dates.nth(index).boundingBox();
      if (!text || !field) throw new Error("Expected sentence word and field");
      expect(Math.abs(field.x - text.x - text.width - 4)).toBeLessThanOrEqual(1);
    }
  });
}

test("sentence count and grade controls are compact and share a four-pixel word gap", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-form--minimum-grade");
  for (const word of ["V5", "this year", "by the end of", "or harder"]) {
    await expect(page.getByText(word, { exact: true })).toHaveCSS("font-size", "14px");
  }
  for (const [word, control] of [
    ["Send", page.getByRole("spinbutton", { name: "Number of climbs" })],
    ["climbs at", page.getByRole("button", { name: /Grade$/ })],
  ] as const) {
    const text = await page.getByText(word, { exact: true }).boundingBox();
    const field = await control.boundingBox();
    if (!text || !field) throw new Error("Expected sentence word and field");
    expect(field.width).toBe(80);
    expect(Math.abs(field.x - text.x - text.width - 4)).toBeLessThanOrEqual(1);
    await expect(control).toHaveCSS("font-size", "14px");
    await expect(page.getByText(word, { exact: true })).toHaveCSS("font-size", "14px");
  }
});

test("climbing days keeps the timeframe inline when it fits and wraps it on mobile", async ({
  page,
}, info) => {
  await openStory(page, info, "components-goals-goal-form--explore");
  const count = await page.getByRole("spinbutton", { name: "Climbing days" }).boundingBox();
  const timeframe = await page.getByRole("button", { name: "Timeframe" }).boundingBox();
  if (!count || !timeframe) throw new Error("Expected count and timeframe controls");
  if (info.project.name.startsWith("desktop")) {
    expect(timeframe.y).toBe(count.y);
    const days = await page.getByText("days", { exact: true }).boundingBox();
    const by = await page.getByText("by the end of", { exact: true }).boundingBox();
    if (!days || !by) throw new Error("Expected adjoining sentence words");
    expect(by.x - days.x - days.width).toBeCloseTo(4, 0);
  } else expect(timeframe.y).toBeGreaterThan(count.y + count.height);
  expect(timeframe.height).toBe(count.height);
});

for (const story of ["new-grade", "recurring", "monthly-training", "new-areas"]) {
  test(`${story} wraps sentence phrases only when they do not fit`, async ({ page }, info) => {
    await openStory(page, info, `components-goals-goal-form--${story}`);
    const timeframe = page.getByRole("button", { name: "Timeframe" });
    const geometry = await timeframe.evaluate((element) => {
      const phrase = element.closest(".select")?.parentElement?.parentElement;
      if (!phrase?.parentElement || !phrase.previousElementSibling)
        throw new Error("Expected sentence phrases");
      const first = phrase.previousElementSibling.getBoundingClientRect();
      const second = phrase.getBoundingClientRect();
      return {
        firstWidth: first.width,
        secondWidth: second.width,
        available: phrase.parentElement.clientWidth,
        firstY: first.y,
        secondY: second.y,
      };
    });
    if (geometry.firstWidth + geometry.secondWidth + 4 <= geometry.available)
      expect(geometry.secondY).toBe(geometry.firstY);
    else expect(geometry.secondY).toBeGreaterThan(geometry.firstY);
  });
}
