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

test(
  "the share dialog fits its audience choice and expiry at both widths",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    // Three segments plus a dropdown in one overlay is the width risk, and it
    // is a real overlay at two very different widths that decides it: a sheet
    // on the phone, a centered column on the desktop.
    await openStory(page, testInfo, "components-journal-project-board--projects");
    await page.getByRole("button", { name: "Share Moonlight Arete" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    if (!bounds) throw new Error("Expected the share dialog to be laid out");

    for (const label of ["Friends", "Members", "Everyone"]) {
      const segment = await dialog.getByRole("button", { name: label, exact: true }).boundingBox();
      if (!segment) throw new Error(`Expected the ${label} segment`);
      expect(segment.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(segment.x + segment.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    }

    const expiry = await dialog.getByRole("button", { name: "Link expires" }).boundingBox();
    const create = await dialog.getByRole("button", { name: "Create link" }).boundingBox();
    if (!expiry || !create) throw new Error("Expected the expiry control and the primary action");
    expect(expiry.x + expiry.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    // The primary action is pinned in the footer, below the body either way.
    expect(create.y).toBeGreaterThan(expiry.y);
  },
);
