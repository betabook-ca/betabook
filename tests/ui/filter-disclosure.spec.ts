import { test, expect, openStory } from "./story";

test("filter toggle describes its next action and keeps its outline when open", async ({
  page,
}, info) => {
  await openStory(page, info, "components-filters-sends-toolbar--default");
  await page.getByRole("button", { name: "Expand filters", exact: true }).click();
  const close = page.getByRole("button", { name: "Hide filters", exact: true });
  await expect(close).toHaveAttribute("aria-expanded", "true");
  await expect(close).toHaveText("Filters");
  const panel = page.getByRole("region", { name: "Filter options" });
  await expect(close).toHaveCSS("border-top-width", "1px");
  const colors = await panel.evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  expect(colors.border).not.toBe(colors.background);
  await close.click();
  await expect(page.getByRole("button", { name: "Expand filters", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("analytics filter and customize actions share default and hover styling", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-analytics-dashboard--filters");
  const expand = page.getByRole("button", { name: "Expand filters", exact: true });
  const customize = page.getByRole("button", { name: "Customize dashboard", exact: true });
  const readStyle = (el: Element) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      color: s.color,
      border: s.borderTopColor,
      borderWidth: s.borderTopWidth,
    };
  };
  expect(await expand.evaluate(readStyle)).toEqual(await customize.evaluate(readStyle));
  await expand.hover();
  const filterHover = await expand.evaluate(readStyle);
  await customize.hover();
  expect(await customize.evaluate(readStyle)).toEqual(filterHover);
  await expand.click();
  const filters = page.getByRole("region", { name: "Filter options", exact: true });
  const filterSurface = await filters.evaluate((el) => getComputedStyle(el).backgroundColor);
  await customize.click();
  expect(
    await page
      .getByRole("region", { name: "Customize dashboard", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(filterSurface);
});
