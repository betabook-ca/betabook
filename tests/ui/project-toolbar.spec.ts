import { expect, openStory, test } from "./story";

test(
  "project search, standard-width sort and track control share one row",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-project-board--projects");
    const search = await page.getByRole("searchbox", { name: "Filter projects" }).boundingBox();
    const sort = await page.getByRole("button", { name: "Sort projects" }).boundingBox();
    const pin = await page.getByRole("button", { name: "Track project" }).boundingBox();
    if (!search || !sort || !pin)
      throw new Error("Expected project search, sort and track controls");
    const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centre(search) - centre(sort))).toBeLessThanOrEqual(1);
    expect(Math.abs(centre(search) - centre(pin))).toBeLessThanOrEqual(1);
    expect(sort.width).toBe(176);
  },
);

test(
  "an empty board keeps the same toolbar row and puts the message below it",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    // The empty board is where a climber starts. It carries the populated
    // board's toolbar so the track control doesn't move on their first one.
    await openStory(page, testInfo, "components-journal-project-board--no-projects");
    const search = await page.getByRole("searchbox", { name: "Filter projects" }).boundingBox();
    const sort = await page.getByRole("button", { name: "Sort projects" }).boundingBox();
    const pin = await page.getByRole("button", { name: "Track project" }).boundingBox();
    const message = await page.getByText(/No projects tracked yet/).boundingBox();
    const viewport = page.viewportSize();
    if (!search || !sort || !pin || !message || !viewport) {
      throw new Error("Expected the empty board's toolbar, message and a viewport");
    }
    const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centre(search) - centre(sort))).toBeLessThanOrEqual(1);
    expect(Math.abs(centre(search) - centre(pin))).toBeLessThanOrEqual(1);
    expect(sort.width).toBe(176);
    // Below the row, not beside it.
    expect(message.y).toBeGreaterThan(search.y + search.height);
    expect(pin.x + pin.width).toBeLessThanOrEqual(viewport.width);
  },
);
