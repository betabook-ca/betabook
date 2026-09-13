import { appBaseURL } from "./app-server";
import { expect, test, openStory } from "./story";

test(
  "auth and recovery pages use the canonical page title",
  { tag: ["@behavior", "@app"] },
  async ({ page }, info) => {
    for (const [path, title] of [
      ["/sign-in", "Sign in"],
      ["/sign-up", "Sign up"],
      ["/forgot-password", "Forgot password"],
      ["/reset-password", "Invalid reset link"],
    ]) {
      await page.goto(`${appBaseURL}${path}`);
      const heading = page.getByRole("heading", { level: 1, name: title, exact: true });
      await expect(heading).toHaveCSS("font-size", "30px");
      await expect(heading).toHaveCSS("font-family", /barlow/i);
      await expect(heading).toHaveCSS("font-weight", "600");
      await info.attach(title, {
        // Hiding carets mutates SSR input styles and can race React hydration.
        body: await page.screenshot({ animations: "disabled", caret: "initial" }),
        contentType: "image/png",
      });
    }
  },
);

test("tag feedback is associated, readable and uses the invalid field treatment", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-tag-input--journal-tags");
  const input = page.getByRole("combobox", { name: "Tags" });
  await input.fill("bad!");
  await input.press("Enter");
  await expect(input).toHaveAccessibleDescription(
    "Tags can only contain letters, numbers and hyphens.",
  );
  const error = page.getByRole("alert");
  await expect(error).toHaveText("Tags can only contain letters, numbers and hyphens.");
  await expect(error).toHaveCSS("font-size", "14px");
  await expect(error).toHaveCSS("font-family", /geist/i);
  await expect(input).toHaveAttribute("data-invalid", "true");
  await expect(input).toHaveCSS("box-shadow", /0px 0px 0px 2px/);
  await expect(input).toBeFocused();
  await input.fill("hangboard");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Remove tag hangboard" })).toBeVisible();
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await expect(error).toHaveCount(0);
  await expect(input).toHaveAccessibleDescription("Enter, Space, or comma to add.");
  await input.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const remove = page.getByRole("button", { name: "Remove tag hangboard" });
  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS("box-shadow", /0px 0px 0px 2px/);
  await page.keyboard.press("Enter");
  await expect(remove).toHaveCount(0);
});

test("privacy field labels and errors follow HeroUI field semantics", async ({ page }, info) => {
  await openStory(page, info, "components-account-privacy-fields--privacy-error");
  const label = page.getByText("Send commentary", { exact: true });
  await expect(label).toHaveCSS("font-size", "14px");
  const trigger = page.getByRole("button", { name: /Send commentary audience/ });
  await expect(trigger).toHaveAccessibleDescription(/Could not save commentary/);
  await expect(trigger).toHaveCSS("outline-width", "1px");
  const errorColor = await page
    .getByText("Could not save commentary. Try again.")
    .evaluate((element) => getComputedStyle(element).color);
  await expect(label).toHaveCSS("color", errorColor);
  await trigger.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("Friends");
});

test("sort direction matches its field size and works from the keyboard", async ({
  page,
}, info) => {
  await openStory(page, info, "components-inputs-sort-select--default");
  const select = page.getByRole("button", { name: /Sort by/ });
  const direction = page.getByRole("button", { name: "Sort ascending", exact: true });
  const label = page.getByText("Sort by", { exact: true });
  await expect(label).toBeVisible();
  const labelBox = await label.boundingBox();
  const fieldBox = await select.boundingBox();
  const directionBox = await direction.boundingBox();
  if (!labelBox || !fieldBox || !directionBox) throw new Error("Missing sort controls");
  expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(fieldBox.x);
  expect(labelBox.y + labelBox.height / 2).toBeCloseTo(fieldBox.y + fieldBox.height / 2);
  expect(directionBox.y).toBeCloseTo(fieldBox.y);
  const height = await select.evaluate((element) => getComputedStyle(element).height);
  await expect(direction).toHaveCSS("height", height);
  await expect(direction).toHaveCSS("width", height);
  await select.focus();
  await page.keyboard.press("Tab");
  await expect(direction).toBeFocused();
  await expect(direction).toHaveCSS("box-shadow", /0px 0px 0px 2px/);
  await page.keyboard.press("Enter");
  await expect(page.locator("output")).toHaveText("name_desc");
  await expect(page.getByRole("button", { name: "Sort descending" })).toBeFocused();
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--field-border-width", "4px"),
  );
  const borderedHeight = await select.evaluate((element) => getComputedStyle(element).height);
  const descending = page.getByRole("button", { name: "Sort descending" });
  await expect(descending).toHaveCSS("height", borderedHeight);
  await expect(descending).toHaveCSS("width", borderedHeight);
});
