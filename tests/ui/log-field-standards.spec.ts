import { test, expect, openStory } from "./story";

test(
  "Log entry uses shared date and grade widths and direct friend copy",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-journal-entry-fields--outdoor");
    await page.getByRole("button", { name: "Add details" }).click();
    await expect(page.getByRole("combobox", { name: "Find a friend to tag" })).toHaveAttribute(
      "placeholder",
      "Find a friend to tag…",
    );
    const date = await page.getByRole("group", { name: "Date", exact: true }).boundingBox();
    if (!date) throw new Error("Missing date field");
    expect(date.width).toBe(176);
    const style = await page.getByRole("radiogroup", { name: "Session or send" }).boundingBox();
    if (!style) throw new Error("Missing session-or-send picker");
    expect(style.y + style.height).toBeLessThan(date.y);
    await page.getByRole("radio", { name: "Redpoint", exact: true }).click();
    const grade = await page.getByRole("button", { name: /Suggested grade$/ }).boundingBox();
    if (!grade) throw new Error("Missing grade field");
    expect(grade.width).toBe(112);
    await page.screenshot({
      path: info.outputPath("log-fields.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

test(
  "rope grades use short fields without truncating the selected grade",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-inputs-index-select--rope-grades");
    const field = page.getByRole("button", { name: /Min grade$/ });
    const box = await field.boundingBox();
    if (!box) throw new Error("Missing rope field");
    expect(box.width).toBe(112);
    const value = field.locator('[data-slot="select-value"]');
    expect(await value.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  },
);

test("Log entry notes fill the form width", { tag: "@layout" }, async ({ page }, info) => {
  await openStory(page, info, "components-journal-entry-fields--outdoor");
  const notes = page.getByRole("textbox", { name: "Notes", exact: true });
  const fits = await notes.evaluate((element) => {
    const form = element.closest("form");
    if (!form) throw new Error("Missing entry form");
    const style = getComputedStyle(form);
    const available =
      form.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    return Math.abs(element.getBoundingClientRect().width - available) < 2;
  });
  expect(fits).toBe(true);
  await page.screenshot({ path: info.outputPath("full-width-notes.png"), fullPage: true });
});
