import { expect, test, openStory } from "./story";

for (const story of ["training", "climb", "send", "repeat"]) {
  test(
    `Log ${story} puts the save button on the right, within reach`,
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

      // Logging an entry is the overlay opened most often from a phone, so
      // below md it is a sheet: full width, flush to the bottom edge, with
      // the save action in the thumb's half of the screen. From md up the
      // same dialog is a centered column.
      if (viewport.width < 768) {
        expect(box.width).toBe(viewport.width);
        expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
        expect(action.y).toBeGreaterThan(viewport.height / 2);
      } else {
        expect(box.width).toBeLessThanOrEqual(512);
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
        expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
      }
      expect(Math.abs(action.x + action.width - form.x - form.width)).toBeLessThanOrEqual(2);
      expect(action.width).toBeLessThan(form.width / 2);
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

    // One dialog, two shapes. Below md it is a bottom sheet: the full width
    // of the phone and flush to its bottom edge, so the form sits under the
    // thumb. From md up it is a centered column no wider than 32rem.
    if (viewport.width < 768) {
      expect(box.width).toBe(viewport.width);
      expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
    } else {
      expect(box.width).toBeLessThanOrEqual(512);
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    }
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
