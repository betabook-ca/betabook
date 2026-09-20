import { expect, openStory, test } from "./story";

test(
  "project search, standard-width sort and pin control share one row",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-project-board--projects");
    const search = await page.getByRole("searchbox", { name: "Filter projects" }).boundingBox();
    const sort = await page.getByRole("button", { name: "Sort projects" }).boundingBox();
    const pin = await page.getByRole("button", { name: "Pin project" }).boundingBox();
    if (!search || !sort || !pin) throw new Error("Expected project search, sort and pin controls");
    const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centre(search) - centre(sort))).toBeLessThanOrEqual(1);
    expect(Math.abs(centre(search) - centre(pin))).toBeLessThanOrEqual(1);
    expect(sort.width).toBe(176);
  },
);

test(
  "the pin control stays on screen when there is nothing pinned yet",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    // The empty board is where a climber starts, and pinning is the only way
    // out of it — the control cannot be hidden along with the rest of the toolbar.
    await openStory(page, testInfo, "components-journal-project-board--no-projects");
    const pin = page.getByRole("button", { name: "Pin project" });
    await expect(pin).toBeVisible();
    const box = await pin.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("Expected the pin control and a viewport");
    expect(box.height).toBeGreaterThanOrEqual(32);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  },
);
