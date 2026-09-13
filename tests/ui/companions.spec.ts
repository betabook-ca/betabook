import { expect, test, openStory } from "./story";

test("friend-tag guidance is in a tooltip accessible by pointer and keyboard", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, `components-journal-companion-picker--selection`);
  const help = page.getByRole("button", { name: "About tagged friends", exact: true });
  const tooltip = page.getByRole("tooltip");
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute("type", "button");
  await expect(tooltip).toBeHidden();
  await expect(page.getByText(/Only for this entry\. Tagging/)).toHaveCount(0);
  if (testInfo.project.use.hasTouch) {
    await help.tap();
  } else {
    await page.mouse.move(1, 1);
    await help.hover();
  }
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(
    "Tagging doesn’t log the climb for them or share the entry with them.",
  );
  await expect(tooltip).toContainText(
    "Anyone who can read this entry sees who you tagged. A friend whose journal is Only me is shown only to you and them.",
  );
  await expect(tooltip).toContainText("Changes replace all tags, including hidden ones.");
  await expect(tooltip).toHaveCSS("word-break", "normal");
  await expect(tooltip).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("companion-help.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.mouse.move(0, 0);
  await page.getByRole("combobox").focus();
  await expect(tooltip).toBeHidden();
  await page.keyboard.press("Shift+Tab");
  await expect(help).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});

test(
  "friend selection closes suggestions and preserves keyboard focus",
  { tag: "@behavior" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-companion-picker--selection");
    const input = page.getByRole("combobox", { name: "Find a friend to tag" });
    await input.fill("Alex");
    await expect(page.getByRole("option", { name: "Alex Rivera" })).toBeVisible();
    await input.press("ArrowDown");
    await input.press("Enter");
    // Selecting a friend must dismiss the menu before the selected chips move the field.
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toBeFocused();
    await expect(page.getByRole("listbox", { includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove friend Alex Rivera" })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("selected-companions.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);
test("friend suggestions follow the moved field when adding another friend", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, `components-journal-companion-picker--selection`);
  const input = page.getByRole("combobox", { name: "Find a friend to tag" });
  await input.fill("Alex");
  await page.getByRole("option", { name: "Alex Rivera", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeFocused();
  await expect(page.getByRole("listbox", { includeHidden: true })).toHaveCount(0);
  await input.fill("Sam");
  await expect(
    page.getByRole("option", { name: "Sam With A Long Climbing Name", exact: true }),
  ).toBeVisible();
  const field = await input.boundingBox();
  const menu = await page.getByRole("listbox").boundingBox();
  if (!field || !menu) throw new Error("Missing friend field or suggestions");
  expect(menu.y >= field.y + field.height || menu.y + menu.height <= field.y).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("next-friend-suggestions.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("option", { name: "Sam With A Long Climbing Name", exact: true }).click();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("list", { name: "Selected friends" }).getByRole("button"),
  ).toHaveCount(2);
  await expect(page.getByRole("status", { name: "2 of 10 friends" })).toContainText("2/10 friends");
  await input.fill("zzz");
  await expect(page.getByText("No friends match.")).toBeVisible();
  await input.fill("");
  await expect(input).toHaveAttribute("aria-expanded", "false");
});
