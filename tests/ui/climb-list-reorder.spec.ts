import { expect, openStory, test } from "./story";

// Arrow-button moves and the saved order are covered in
// components/climb-lists/climb-list-items.dom.test.tsx. This is the one thing
// jsdom can't do: a real pointer drag through react-aria's drag and drop.
test(
  "dragging a climb by its handle moves it in the list",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-climb-lists-reorder--default");
    const grid = page.getByRole("grid", { name: "Reorder climbs", exact: true });
    const rows = grid.getByRole("row");
    await expect(rows.first()).toContainText("Amarillo Sunset");

    const handle = await page
      .getByRole("button", { name: "Drag Amarillo Sunset", exact: true })
      .boundingBox();
    const target = await rows.nth(1).boundingBox();
    if (!handle || !target) throw new Error("reorder rows did not render");

    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 15, {
      steps: 5,
    });
    await expect(page.locator("[data-dragging]")).toHaveCount(1);
    await page.mouse.move(target.x + 60, target.y + target.height - 3, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator("[data-dragging]")).toHaveCount(0);
    await expect(rows.nth(0)).toContainText("Gift of the Magi");
    await expect(rows.nth(1)).toContainText("Amarillo Sunset");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  },
);
