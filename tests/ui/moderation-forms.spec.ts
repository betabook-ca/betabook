import { expect, openStory, test } from "./story";

test(
  "move destination suggestions fit inside the viewport",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-forms-area-move-dialog--queued-move");
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("combobox", { name: "Area" }).fill("Cedar");
    await expect(
      page.getByRole("option", { name: "Cedar Grove California / North Woods", exact: true }),
    ).toBeVisible();
    const menu = await page.getByRole("listbox").boundingBox();
    const viewport = page.viewportSize();
    if (!menu || !viewport) throw new Error("Missing destination menu");
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
    expect(menu.y + menu.height).toBeLessThanOrEqual(viewport.height);
  },
);

test(
  "rename drawers associate their labels and keep grade options inside the viewport",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-forms-climb-edit-request--ungraded");
    await page.getByRole("button", { name: "Request climb edit" }).click();
    const name = page.getByRole("textbox", { name: /^Name\*?$/ });
    await page.getByRole("dialog").getByText("Name", { exact: true }).click();
    await expect(name).toBeFocused();
    await expect(page.getByRole("combobox", { name: "Discipline" })).toHaveValue("boulder");
    const grade = page.getByRole("button", { name: /Grade$/ });
    await expect(grade).toContainText("Unknown");
    await grade.click();
    const listbox = page.getByRole("listbox");
    await expect(listbox.getByRole("option", { name: "Unknown", exact: true })).toBeVisible();
    const bounds = await listbox.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Missing grade menu or viewport");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

    await openStory(page, info, "components-forms-area-edit-request--rename");
    await page.getByRole("button", { name: "Request area rename" }).click();
    await page.getByRole("dialog").getByText("Name", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: /^Name\*?$/ })).toBeFocused();
  },
);

test(
  "rejection failures remain readable within the open dialog",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-moderation-review-controls--rejection-fails");
    const dialog = page.getByRole("alertdialog");
    const error = dialog.getByRole("alert");
    await expect(error).toHaveText("Couldn't save this decision. Try again.");
    await expect(error).toBeInViewport();
    await expect(dialog.getByRole("textbox")).toHaveValue("Please keep the original name.");
    const bounds = await error.boundingBox();
    const dialogBounds = await dialog.boundingBox();
    if (!bounds || !dialogBounds) throw new Error("Missing dialog or error bounds");
    expect(bounds.x).toBeGreaterThanOrEqual(dialogBounds.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(dialogBounds.x + dialogBounds.width);
  },
);
