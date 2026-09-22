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
  "the share dialog fits its warning, expiry and link at both widths",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    // A long warning above a dropdown above a read-only URL is the width and
    // height risk, and it is a real overlay at two very different sizes that
    // decides it: a sheet on the phone, a centered column on the desktop.
    await openStory(page, testInfo, "components-journal-project-board--shared-project");
    await page.getByRole("button", { name: "Manage the link for Moonlight Arete" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    if (!bounds) throw new Error("Expected the share dialog to be laid out");
    const right = bounds.x + bounds.width + 1;

    const expiry = await dialog.getByRole("button", { name: "Expires after" }).boundingBox();
    const field = await dialog.getByLabel("Project link").boundingBox();
    const renew = await dialog.getByRole("button", { name: "Renew link" }).boundingBox();
    if (!expiry || !field || !renew) {
      throw new Error("Expected the expiry control, the link field and the primary action");
    }
    // The URL is long and read-only; it must not push the dialog wider than
    // the viewport allows or hide its own right-hand end.
    expect(field.x + field.width).toBeLessThanOrEqual(right);
    expect(expiry.x + expiry.width).toBeLessThanOrEqual(right);
    // The primary action is pinned in the footer, below the body either way.
    expect(renew.y).toBeGreaterThan(field.y);

    // The deadline is a date the owner can read, not a countdown.
    await expect(dialog.getByText(/Link expires \w+ \d+, \d{4}/)).toBeVisible();
  },
);
