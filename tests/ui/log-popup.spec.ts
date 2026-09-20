import { expect, test, openStory } from "./story";

for (const [field, viewportOnly] of [
  ["Find a friend to tag", false],
  ["Tags", false],
  ["Find a friend to tag", true],
  ["Tags", true],
] as const) {
  test(`Log keeps ${field} visible as the keyboard opens (${viewportOnly ? "visual viewport" : "window resize"})`, async ({
    page,
  }, info) => {
    await openStory(page, info, "components-journal-log-popup--climb");
    const dialog = page.getByRole("dialog", { name: "Log entry" });
    await dialog.getByRole("button", { name: "Add details" }).click();
    const input = dialog.getByRole("combobox", { name: field, exact: true });
    await input.click();
    // Desktop automation has no software keyboard. Exercise both browsers that
    // resize the window and those that shrink only the visual viewport.
    if (viewportOnly) {
      await page.evaluate(() => {
        const viewport = window.visualViewport;
        if (!viewport) throw new Error("Missing visual viewport");
        Object.defineProperty(viewport, "height", { configurable: true, value: 380 });
        viewport.dispatchEvent(new Event("resize"));
      });
    } else {
      await page.setViewportSize({ width: page.viewportSize()?.width ?? 375, height: 380 });
    }
    await expect(input).toBeFocused();
    await expect
      .poll(async () =>
        input.evaluate((element) => {
          const field = element.getBoundingClientRect();
          const body = element.closest(".modal__body")?.getBoundingClientRect();
          if (!body) throw new Error("Missing modal scroll body");
          return (
            field.top >= body.top &&
            field.bottom <=
              Math.min(body.bottom, window.visualViewport?.height ?? window.innerHeight)
          );
        }),
      )
      .toBe(true);
    await info.attach("keyboard-field", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });
}

for (const story of ["training", "climb", "send", "repeat"]) {
  test(
    `Log ${story} uses a centered popup with the save button on the right`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, `components-journal-log-popup--${story}`);
      const dialog = page.getByRole("dialog", { name: "Log entry" });
      const save = dialog.getByRole("button", { name: /^Save (entry|send)$/ });
      const box = await dialog.boundingBox();
      const action = await save.boundingBox();
      const form = await dialog.locator("form").boundingBox();
      const viewport = page.viewportSize();
      if (!box || !action || !form || !viewport) throw new Error("Expected log popup geometry");
      expect(box.width).toBeLessThanOrEqual(512);
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(action.x + action.width - form.x - form.width)).toBeLessThanOrEqual(2);
      expect(action.width).toBeLessThan(form.width / 2);
      expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
      await save.scrollIntoViewIfNeeded();
      const visibleAction = await save.boundingBox();
      if (!visibleAction) throw new Error("Expected reachable save action");
      expect(visibleAction.y).toBeGreaterThanOrEqual(0);
      expect(visibleAction.y + visibleAction.height).toBeLessThanOrEqual(viewport.height);
      await expect(save).toBeVisible();
    },
  );
}

test(
  "Log launcher keeps standard spacing after closing the popup",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-journal-log-popup--choose-entry");
    await page
      .getByRole("dialog", { name: "Log entry" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const heading = await page
      .getByRole("heading", { name: "Log an entry", exact: true })
      .boundingBox();
    const button = await page.getByRole("button", { name: "Log", exact: true }).boundingBox();
    if (!heading || !button) throw new Error("Expected closed popup launcher");
    expect(button.y - heading.y - heading.height).toBe(24);
    expect(button.x).toBe(heading.x);
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Log entry" })).toBeVisible();
  },
);

for (const kind of ["session", "training"]) {
  test(`Edit ${kind} matches the Log popup layout`, { tag: "@layout" }, async ({ page }, info) => {
    await openStory(page, info, `components-journal-edit-popup--${kind}`);
    const dialog = page.getByRole("dialog", { name: `Edit ${kind}` });
    const box = await dialog.boundingBox();
    const form = await dialog.locator("form").boundingBox();
    const save = await dialog.getByRole("button", { name: "Save changes" }).boundingBox();
    const viewport = page.viewportSize();
    if (!box || !form || !save || !viewport) throw new Error("Expected edit popup geometry");
    expect(box.width).toBeLessThanOrEqual(512);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(form.x + form.width - save.x - save.width)).toBeLessThanOrEqual(2);
  });
}

test("entry type cards have equal dimensions", async ({ page }, info) => {
  await openStory(page, info, "components-journal-log-popup--choose-entry");
  const outdoor = page.getByRole("button", { name: /^Outdoor session One climb/ });
  const training = page.getByRole("button", { name: /^Training Indoor/ });
  const left = await outdoor.boundingBox();
  const right = await training.boundingBox();
  if (!left || !right) throw new Error("Expected both entry type cards");
  expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(left.height - right.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
});
