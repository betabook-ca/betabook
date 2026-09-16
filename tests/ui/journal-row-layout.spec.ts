import { expect, openStory, test } from "./story";

test("journal notes use the row width and expanding them leaves the grade aligned with the title", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-entry-row--sent-long-note");
  const row = page.locator("[data-journal-example]");
  const title = row.getByRole("link", { name: "Cedar Arete", exact: true });
  const grade = row.getByText("V4", { exact: true });
  const menu = row.getByRole("button", { name: "Entry actions" });
  const note = row.getByText(/^Found a comfortable high foot/);
  const titleBox = await title.boundingBox();
  const gradeBox = await grade.boundingBox();
  const noteBox = await note.boundingBox();
  const rowBox = await row.boundingBox();
  if (!titleBox || !gradeBox || !noteBox || !rowBox) throw new Error("Missing journal row bounds");
  expect(
    Math.abs(gradeBox.y + gradeBox.height / 2 - titleBox.y - titleBox.height / 2),
  ).toBeLessThanOrEqual(2);
  expect(noteBox.width).toBeGreaterThanOrEqual(Math.min(rowBox.width - 32, 450));
  await expect(menu).toHaveCSS("width", "44px");
  await expect(menu).toHaveCSS("height", "44px");
  await row.getByRole("button", { name: "Show more" }).click();
  expect((await grade.boundingBox())?.y).toBe(gradeBox.y);
  await expect(row.getByRole("button", { name: "Show less" })).toBeVisible();
});
